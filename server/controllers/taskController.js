import mongoose from 'mongoose'
import Role, { SYSTEM_ROLES } from '../models/role.js'
import Task from '../models/task.js'
import User from '../models/user.js'
import { notifyUsers } from '../services/notifications.js'

async function roleLevel(roleKey) {
  let role = await Role.findOne({ key: roleKey }).select('level').lean()
  if (!role) {
    const systemRole = SYSTEM_ROLES.find((item) => item.key === roleKey)
    if (systemRole) return systemRole.level
    return 10
  }
  return role.level ?? 10
}

async function ensureRoles() {
  await Role.bulkWrite(SYSTEM_ROLES.map((role) => ({
    updateOne: { filter: { key: role.key }, update: { $set: { ...role, isSystem: true } }, upsert: true },
  })))
}

function validId(value) { return mongoose.isValidObjectId(value) }

export async function getTaskAssignees(req, res, next) {
  try {
    await ensureRoles()
    const actorLevel = await roleLevel(req.user.role)
    const roles = await Role.find({ level: { $lt: actorLevel } }).select('key name level').lean()
    const filter = { isVerified: true, _id: { $ne: req.user._id }, role: { $in: roles.map((role) => role.key) } }
    if (req.user.role === 'manager') {
      if (!req.user.department?._id) return res.status(400).json({ message: 'A department must be assigned to your manager account.' })
      filter.department = req.user.department._id
    }
    const users = await User.find(filter).select('name email role department').populate('department', 'name').sort({ name: 1 }).lean()
    const roleNames = new Map(roles.map((role) => [role.key, role.name]))
    return res.json({ users: users.map((user) => ({ id: user._id, name: user.name, email: user.email, role: user.role, roleName: roleNames.get(user.role) || user.role, department: user.department })) })
  } catch (error) { return next(error) }
}

export async function listTasks(req, res, next) {
  try {
    const filter = {}
    if (req.user.role === 'admin' || req.user.role === 'hr') {
      // HR and admins can view the organization task list.
    } else if (req.user.role === 'manager') {
      if (!req.user.department?._id) return res.status(400).json({ message: 'A department must be assigned to your manager account.' })
      const teamIds = await User.find({ department: req.user.department._id }).distinct('_id')
      filter.$or = [{ assignedTo: { $in: teamIds } }, { assignedBy: req.user._id }]
    } else {
      filter.$or = [{ assignedTo: req.user._id }, { assignedBy: req.user._id }]
    }
    const tasks = await Task.find(filter).populate('assignedTo', 'name email role').populate('assignedBy', 'name email role').populate('department', 'name').sort({ createdAt: -1 }).lean()
    return res.json({ tasks })
  } catch (error) { return next(error) }
}

export async function createTask(req, res, next) {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
  const { assignedTo, dueDate } = req.body || {}
  if (title.length < 3 || title.length > 120) return res.status(400).json({ message: 'Task title must be between 3 and 120 characters.' })
  if (description.length > 2000) return res.status(400).json({ message: 'Description must be 2,000 characters or fewer.' })
  if (!validId(assignedTo)) return res.status(400).json({ message: 'Select a valid team member.' })
  if (dueDate && Number.isNaN(Date.parse(dueDate))) return res.status(400).json({ message: 'Enter a valid due date.' })
  try {
    await ensureRoles()
    const [actorLevel, assignee] = await Promise.all([
      roleLevel(req.user.role), User.findById(assignedTo).select('name email role department isVerified'),
    ])
    if (!assignee || !assignee.isVerified) return res.status(404).json({ message: 'The selected team member is unavailable.' })
    if (actorLevel <= await roleLevel(assignee.role)) return res.status(403).json({ message: 'You can only assign tasks to someone lower in the role hierarchy.' })
    if (req.user.role === 'manager' && (!req.user.department?._id || String(assignee.department) !== String(req.user.department._id))) {
      return res.status(403).json({ message: 'Managers can assign tasks only within their department.' })
    }
    const task = await Task.create({ title, description, assignedTo: assignee._id, assignedBy: req.user._id, department: assignee.department || null, dueDate: dueDate || null })
    await notifyUsers([assignee._id], {
      actorId: req.user._id, actorName: req.user.name, type: 'task', title: 'A task was assigned to you',
      message: `${req.user.name} assigned “${task.title}” to you.`, page: 'tasks', entityId: String(task._id),
    })
    const populated = await Task.findById(task._id).populate('assignedTo', 'name email role').populate('assignedBy', 'name email role').populate('department', 'name').lean()
    return res.status(201).json({ task: populated })
  } catch (error) { return next(error) }
}

export async function updateTaskStatus(req, res, next) {
  const { status } = req.body || {}
  if (!['pending', 'in-progress', 'completed'].includes(status)) return res.status(400).json({ message: 'Choose a valid task status.' })
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid task ID.' })
  try {
    const task = await Task.findById(req.params.id)
    if (!task) return res.status(404).json({ message: 'Task not found.' })
    const isAssignee = String(task.assignedTo) === String(req.user._id)
    const isAssigner = String(task.assignedBy) === String(req.user._id)
    if (!isAssignee && !isAssigner && !['admin', 'hr'].includes(req.user.role)) return res.status(403).json({ message: 'You cannot update this task.' })
    const previousStatus = task.status
    task.status = status
    await task.save()
    if (previousStatus !== status) {
      await notifyUsers([task.assignedTo, task.assignedBy], {
        actorId: req.user._id, actorName: req.user.name, type: 'task', title: 'Task status updated',
        message: `${req.user.name} changed “${task.title}” to ${status.replace('-', ' ')}.`, page: 'tasks', entityId: String(task._id),
      })
    }
    const populated = await Task.findById(task._id).populate('assignedTo', 'name email role').populate('assignedBy', 'name email role').populate('department', 'name').lean()
    return res.json({ task: populated })
  } catch (error) { return next(error) }
}

import mongoose from 'mongoose'
import Role, { SYSTEM_ROLES } from '../models/role.js'
import Task from '../models/task.js'
import LeaveRequest from '../models/leaveRequest.js'
import User from '../models/user.js'
import { notifyUsers } from '../services/notifications.js'
import { getPaginationOptions, paginateQuery } from '../utils/pagination.js'

/** Resolves a role's hierarchy rank so assignment permissions stay data-driven. */
async function roleLevel(roleKey) {
  let role = await Role.findOne({ key: roleKey }).select('level').lean()
  if (!role) {
    const systemRole = SYSTEM_ROLES.find((item) => item.key === roleKey)
    if (systemRole) return systemRole.level
    return 10
  }
  return role.level ?? 10
}

/** Ensures built-in roles exist before hierarchy-based task checks run. */
async function ensureRoles() {
  await Role.bulkWrite(SYSTEM_ROLES.map((role) => ({
    updateOne: { filter: { key: role.key }, update: { $set: { ...role, isSystem: true } }, upsert: true },
  })))
}

/** Confirms a supplied task or user ID can be safely used in a MongoDB query. */
function validId(value) { return mongoose.isValidObjectId(value) }

/** Confirms a chosen, approved leave record belongs to the employee and includes the task due date. */
export function isLeaveCoverageEligible(leave, employeeId, dueDateKey) {
  return Boolean(leave
    && String(leave.requester) === String(employeeId)
    && leave.status === 'approved'
    && typeof leave.startDate === 'string'
    && typeof leave.endDate === 'string'
    && leave.startDate <= dueDateKey
    && leave.endDate >= dueDateKey)
}

/** Lists verified employees below the current user in the task-assignment hierarchy. */
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
    const coverageDate = req.query.coverageDate
    if (coverageDate && (!/^\d{4}-\d{2}-\d{2}$/.test(coverageDate) || Number.isNaN(Date.parse(`${coverageDate}T00:00:00.000Z`)) || new Date(`${coverageDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== coverageDate)) {
      return res.status(400).json({ message: 'Choose a valid task due date.' })
    }
    const eligibleUserIds = users.map((user) => user._id)
    const coverageFilter = coverageDate && eligibleUserIds.length ? {
      requester: { $in: eligibleUserIds }, status: 'approved', startDate: { $lte: coverageDate }, endDate: { $gte: coverageDate },
    } : { _id: null }
    const coveragePage = await paginateQuery(
      LeaveRequest.find(coverageFilter).populate({ path: 'requester', select: 'name email role department', populate: { path: 'department', select: 'name' } }).sort({ startDate: 1 }),
      LeaveRequest.countDocuments(coverageFilter),
      getPaginationOptions(req.query),
    )
    const coverageOptions = coveragePage.items.map((leave) => ({
      leaveId: String(leave._id), userId: String(leave.requester._id), name: leave.requester.name,
      email: leave.requester.email, role: leave.requester.role, roleName: roleNames.get(leave.requester.role) || leave.requester.role,
      department: leave.requester.department?.name || '', leaveType: leave.leaveType, startDate: leave.startDate, endDate: leave.endDate,
    }))
    return res.json({
      users: users.map((user) => ({ id: user._id, name: user.name, email: user.email, role: user.role, roleName: roleNames.get(user.role) || user.role, department: user.department })),
      coverageOptions,
      coveragePagination: coveragePage.pagination,
    })
  } catch (error) { return next(error) }
}

/** Returns tasks scoped to the user's role, team, and assignments. */
export async function listTasks(req, res, next) {
  try {
    const filter = {}
    if (req.user.role === 'admin' || req.user.role === 'hr') {
      // HR and admins can view the organization task list.
    } else if (req.user.role === 'manager') {
      if (!req.user.department?._id) return res.status(400).json({ message: 'A department must be assigned to your manager account.' })
      const teamIds = await User.find({ department: req.user.department._id }).distinct('_id')
      filter.$or = [{ assignedTo: { $in: teamIds } }, { coveringFor: { $in: teamIds } }, { assignedBy: req.user._id }]
    } else {
      filter.$or = [{ assignedTo: req.user._id }, { coveringFor: req.user._id }, { assignedBy: req.user._id }]
    }
    const taskPage = await paginateQuery(
      Task.find(filter).populate('assignedTo', 'name email role').populate('assignedBy', 'name email role').populate('coveringFor', 'name email role').populate('coverageLeave', 'leaveType startDate endDate').populate('completedBy', 'name email role').populate('department', 'name').sort({ createdAt: -1 }).lean(),
      Task.countDocuments(filter),
      getPaginationOptions(req.query),
    )
    return res.json({ tasks: taskPage.items, pagination: taskPage.pagination })
  } catch (error) { return next(error) }
}

/** Validates and assigns work while enforcing role and department boundaries. */
export async function createTask(req, res, next) {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
  const { assignedTo, dueDate, coveringEmployeeId, coverageLeaveId } = req.body || {}
  if (title.length < 3 || title.length > 120) return res.status(400).json({ message: 'Task title must be between 3 and 120 characters.' })
  if (description.length > 2000) return res.status(400).json({ message: 'Description must be 2,000 characters or fewer.' })
  if (!validId(assignedTo)) return res.status(400).json({ message: 'Select a valid team member.' })
  if (dueDate && Number.isNaN(Date.parse(dueDate))) return res.status(400).json({ message: 'Enter a valid due date.' })
  if (coveringEmployeeId && !validId(coveringEmployeeId)) return res.status(400).json({ message: 'Select a valid employee whose duties need coverage.' })
  if (coverageLeaveId && !validId(coverageLeaveId)) return res.status(400).json({ message: 'Select a valid approved leave request.' })
  if (Boolean(coveringEmployeeId) !== Boolean(coverageLeaveId)) return res.status(400).json({ message: 'Choose both the employee on leave and their approved leave request.' })
  if (coveringEmployeeId && !dueDate) return res.status(400).json({ message: 'A due date is required for a leave coverage assignment.' })
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
    let coveredEmployee = null
    let coverageLeave = null
    if (coveringEmployeeId) {
      const dueDateKey = new Date(`${dueDate}T12:00:00.000Z`).toISOString().slice(0, 10)
      ;[coveredEmployee, coverageLeave] = await Promise.all([
        User.findOne({ _id: coveringEmployeeId, isVerified: true }).select('name role department'),
        LeaveRequest.findOne({ _id: coverageLeaveId, requester: coveringEmployeeId, status: 'approved', startDate: { $lte: dueDateKey }, endDate: { $gte: dueDateKey } }).select('requester startDate endDate status'),
      ])
      if (!coveredEmployee || !isLeaveCoverageEligible(coverageLeave, coveringEmployeeId, dueDateKey)) return res.status(400).json({ message: 'The selected employee does not have approved leave covering this task due date.' })
      if (String(coveredEmployee._id) === String(assignee._id)) return res.status(400).json({ message: 'Choose a different employee to cover these duties.' })
      if (actorLevel <= await roleLevel(coveredEmployee.role)) return res.status(403).json({ message: 'You can only reassign duties for an employee below your role in the hierarchy.' })
      if (req.user.role === 'manager' && String(coveredEmployee.department) !== String(req.user.department._id)) {
        return res.status(403).json({ message: 'Managers can arrange coverage only for employees in their department.' })
      }
    }
    const task = await Task.create({ title, description, assignedTo: assignee._id, assignedBy: req.user._id, department: coveredEmployee?.department || assignee.department || null, dueDate: dueDate || null, coveringFor: coveredEmployee?._id || null, coverageLeave: coverageLeave?._id || null })
    await notifyUsers([assignee._id], {
      actorId: req.user._id, actorName: req.user.name, type: 'task', title: coveredEmployee ? 'Leave coverage assignment' : 'A task was assigned to you',
      message: `${req.user.name} assigned “${task.title}” to you.`, page: 'tasks', entityId: String(task._id),
    })
    const populated = await Task.findById(task._id).populate('assignedTo', 'name email role').populate('assignedBy', 'name email role').populate('coveringFor', 'name email role').populate('coverageLeave', 'leaveType startDate endDate').populate('completedBy', 'name email role').populate('department', 'name').lean()
    return res.status(201).json({ task: populated })
  } catch (error) { return next(error) }
}

/** Updates a task status and notifies its assignee and creator when it changes. */
export async function updateTaskStatus(req, res, next) {
  const { status } = req.body || {}
  if (!['pending', 'in-progress', 'completed'].includes(status)) return res.status(400).json({ message: 'Choose a valid task status.' })
  const taskId = req.params.id
  if (!validId(taskId)) return res.status(400).json({ message: 'Invalid task ID.' })
  try {
    let taskFilter = { _id: taskId }
    if (!['admin', 'hr'].includes(req.user.role)) {
      taskFilter = { _id: taskId, $or: [{ assignedTo: req.user._id }, { assignedBy: req.user._id }] }
    }
    const task = await Task.findOne(taskFilter)
    if (!task) return res.status(404).json({ message: 'Task not found.' })
    const previousStatus = task.status
    task.status = status
    task.completedBy = status === 'completed' ? req.user._id : null
    task.completedAt = status === 'completed' ? new Date() : null
    await task.save()
    if (previousStatus !== status) {
      await notifyUsers([task.assignedTo, task.assignedBy, ...(task.coveringFor ? [task.coveringFor] : [])], {
        actorId: req.user._id, actorName: req.user.name, type: 'task', title: 'Task status updated',
        message: `${req.user.name} changed “${task.title}” to ${status.replace('-', ' ')}.`, page: 'tasks', entityId: String(task._id),
      })
    }
    const populated = await Task.findById(task._id).populate('assignedTo', 'name email role').populate('assignedBy', 'name email role').populate('coveringFor', 'name email role').populate('coverageLeave', 'leaveType startDate endDate').populate('completedBy', 'name email role').populate('department', 'name').lean()
    return res.json({ task: populated })
  } catch (error) { return next(error) }
}

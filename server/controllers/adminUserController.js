import Department from '../models/department.js'
import Role from '../models/role.js'
import User from '../models/user.js'
import { ensureSystemRoles } from './organizationController.js'
import { notifyUsers } from '../services/notifications.js'

function publicUser(user) {
  return {
    id: user.id,
    accountId: user.accountId,
    name: user.name,
    email: user.email,
    role: user.role === 'user' ? 'employee' : user.role,
    isVerified: user.isVerified !== false,
    department: user.department ? { id: user.department.id, name: user.department.name } : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

function isValidObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
}

export async function listUsers(req, res, next) {
  try {
    await ensureSystemRoles()
    const [users, roles, departments] = await Promise.all([
      User.find()
        .select('name email role department isVerified createdAt updatedAt')
        .populate('department', 'name')
        .sort({ createdAt: -1 }),
      Role.find().sort({ isSystem: -1, name: 1 }).select('key name isSystem').lean(),
      Department.find().sort({ name: 1 }).select('key name').lean(),
    ])
    return res.json({ users: users.map(publicUser), roles, departments })
  } catch (error) {
    return next(error)
  }
}

export async function updateManagedUser(req, res, next) {
  const { id } = req.params
  const { role, isVerified, departmentId } = req.body || {}
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid user ID.' })
  if (role === undefined && isVerified === undefined && departmentId === undefined) {
    return res.status(400).json({ message: 'Choose a role, department, or verification status to update.' })
  }
  if (isVerified !== undefined && typeof isVerified !== 'boolean') {
    return res.status(400).json({ message: 'Verification status must be true or false.' })
  }
  if (departmentId !== undefined && departmentId !== null && !isValidObjectId(departmentId)) {
    return res.status(400).json({ message: 'Choose a valid department.' })
  }
  if (id === req.user.id && ((role !== undefined && role !== 'admin') || isVerified === false)) {
    return res.status(400).json({ message: 'You cannot remove your own administrator access or verification.' })
  }

  try {
    const user = await User.findById(id)
    if (!user) return res.status(404).json({ message: 'User not found.' })
    const wasVerified = user.isVerified !== false
    const previousRole = user.role
    const previousDepartment = String(user.department || '')

    if (role !== undefined && !(await Role.exists({ key: role }))) {
      return res.status(400).json({ message: 'Choose a valid ERP role.' })
    }
    let department = null
    if (departmentId) {
      department = await Department.findById(departmentId)
      if (!department) return res.status(400).json({ message: 'Choose a valid department.' })
    }

    if (role !== undefined && user.role === 'admin' && role !== 'admin') {
      const otherAdmins = await User.countDocuments({ role: 'admin', _id: { $ne: user._id } })
      if (otherAdmins === 0) return res.status(400).json({ message: 'At least one administrator account must remain.' })
    }

    if (role !== undefined) user.role = role
    if (isVerified !== undefined) user.isVerified = isVerified
    if (departmentId !== undefined) user.department = department?._id || null
    await user.save()
    await user.populate('department', 'name')
    const becameVerified = !wasVerified && user.isVerified !== false
    const organizationAssignmentChanged = previousRole !== user.role || previousDepartment !== String(user.department?._id || '')
    if (becameVerified || organizationAssignmentChanged) {
      const role = await Role.findOne({ key: user.role }).select('name').lean()
      const details = [role?.name || user.role, user.department?.name].filter(Boolean).join(' · ')
      await notifyUsers([user._id], {
        actorId: req.user._id, actorName: req.user.name, type: 'account',
        title: becameVerified ? 'Your account has been verified' : 'Your organization details changed',
        message: becameVerified ? `Your Orbit ERP access is approved. Your role and department: ${details}.` : `Your role and department are now: ${details}.`,
        page: 'profile', entityId: String(user._id),
      })
    }
    return res.json({ user: publicUser(user) })
  } catch (error) {
    return next(error)
  }
}

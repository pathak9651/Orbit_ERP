import Department from '../models/department.js'
import Role, { SYSTEM_ROLES } from '../models/role.js'
import User from '../models/user.js'

// Convert display names into stable URL/database keys for role and department records.
const normalizeKey = (name) => name
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

/** Checks route IDs before attempting role or department lookups. */
function isValidObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
}

/** Trims and validates organization names in one place for consistent feedback. */
function validateName(value, maxLength, label) {
  if (typeof value !== 'string') return `${label} is required.`
  const name = value.trim()
  if (name.length < 2 || name.length > maxLength) return `${label} must be between 2 and ${maxLength} characters.`
  if (!/[a-z0-9]/i.test(name)) return `${label} must include a letter or number.`
  return null
}

/** Inserts or refreshes the built-in roles while preserving custom organization roles. */
export async function ensureSystemRoles() {
  await Role.bulkWrite(SYSTEM_ROLES.map((role) => ({
    updateOne: {
      filter: { key: role.key },
      update: { $set: { ...role, isSystem: true } },
      upsert: true,
    },
  })))
}

/** Returns role and department choices used by administrator settings and assignment forms. */
export async function listOrganizationSettings(req, res, next) {
  try {
    await ensureSystemRoles()
    const [roles, departments] = await Promise.all([
      Role.find().sort({ isSystem: -1, name: 1 }).select('key name isSystem').lean(),
      Department.find().sort({ name: 1 }).select('key name').lean(),
    ])
    return res.json({ roles, departments })
  } catch (error) {
    return next(error)
  }
}

/** Creates a custom role with a hierarchy level below administrator authority. */
export async function createRole(req, res, next) {
  const errorMessage = validateName(req.body?.name, 40, 'Role name')
  if (errorMessage) return res.status(400).json({ message: errorMessage })
  const name = req.body.name.trim()
  const key = normalizeKey(name)
  if (!key) return res.status(400).json({ message: 'Role name must include letters or numbers.' })

  try {
    const role = await Role.create({ key, name, isSystem: false, level: 10 })
    return res.status(201).json({ role: { id: role.id, key: role.key, name: role.name, isSystem: role.isSystem } })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A role with that name already exists.' })
    return next(error)
  }
}

/** Deletes an unused custom role without allowing removal of system roles. */
export async function deleteRole(req, res, next) {
  const roleId = req.params.id
  if (!isValidObjectId(roleId)) return res.status(400).json({ message: 'Invalid role ID.' })
  try {
    const role = await Role.findById(roleId)
    if (!role) return res.status(404).json({ message: 'Role not found.' })
    if (role.isSystem || SYSTEM_ROLES.some((item) => item.key === role.key)) {
      return res.status(400).json({ message: 'Built-in roles cannot be deleted.' })
    }
    if (await User.exists({ role: role.key })) {
      return res.status(409).json({ message: 'This role is assigned to users. Reassign them before deleting it.' })
    }
    await role.deleteOne()
    return res.json({ message: 'Role deleted.' })
  } catch (error) {
    return next(error)
  }
}

/** Creates a department after validating its display name and uniqueness. */
export async function createDepartment(req, res, next) {
  const errorMessage = validateName(req.body?.name, 60, 'Department name')
  if (errorMessage) return res.status(400).json({ message: errorMessage })
  const name = req.body.name.trim()
  const key = normalizeKey(name)
  if (!key) return res.status(400).json({ message: 'Department name must include letters or numbers.' })

  try {
    const department = await Department.create({ key, name })
    return res.status(201).json({ department: { id: department.id, key: department.key, name: department.name } })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A department with that name already exists.' })
    return next(error)
  }
}

/** Removes a department only when it is not assigned to any account. */
export async function deleteDepartment(req, res, next) {
  const departmentId = req.params.id
  if (!isValidObjectId(departmentId)) return res.status(400).json({ message: 'Invalid department ID.' })
  try {
    const department = await Department.findById(departmentId)
    if (!department) return res.status(404).json({ message: 'Department not found.' })
    if (await User.exists({ department: department._id })) {
      return res.status(409).json({ message: 'This department is assigned to users. Reassign them before deleting it.' })
    }
    await department.deleteOne()
    return res.json({ message: 'Department deleted.' })
  } catch (error) {
    return next(error)
  }
}




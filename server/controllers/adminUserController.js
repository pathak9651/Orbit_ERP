import Department from '../models/department.js'
import Role from '../models/role.js'
import User from '../models/user.js'
import { ensureSystemRoles } from './organizationController.js'
import { notifyUsers } from '../services/notifications.js'
import { hashPassword } from '../services/auth.js'
import { recordAuditEvent } from '../services/audit.js'
import { getPaginationOptions, paginateQuery } from '../utils/pagination.js'

/** Builds the safe user fields returned to administrator screens. */
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

/** Rejects malformed database IDs before querying MongoDB. */
function isValidObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
}

const IMPORT_ROW_LIMIT = 100

/** Matches common spreadsheet header styles such as "Full Name" and "full_name". */
function normalizeColumnName(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Parses a CSV document while preserving quoted commas, line breaks, and escaped quotes. */
function parseCsvRows(csvText) {
  const rows = []
  let row = []
  let cell = ''
  let insideQuotes = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]
    if (insideQuotes && character === '"' && csvText[index + 1] === '"') {
      cell += '"'
      index += 1
    } else if (character === '"') {
      insideQuotes = !insideQuotes
    } else if (!insideQuotes && character === ',') {
      row.push(cell)
      cell = ''
    } else if (!insideQuotes && (character === '\n' || character === '\r')) {
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
      if (character === '\r' && csvText[index + 1] === '\n') index += 1
    } else {
      cell += character
    }
  }

  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  if (insideQuotes) throw new Error('The Google Sheet CSV contains an unclosed quoted value.')
  if (rows.length < 2) throw new Error('The spreadsheet must include a header row and at least one user row.')

  const headers = rows[0].map(normalizeColumnName)
  if (headers.some((header) => !header)) throw new Error('Every spreadsheet column must have a header.')
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
}

/** Creates valid spreadsheet rows and reports duplicate or invalid rows without stopping the batch. */
async function createUsersFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(new Error('The spreadsheet has no user rows to import.'), { status: 400 })
  }
  const nonEmptyRows = rows.filter((row) => row && typeof row === 'object' && Object.values(row).some((value) => String(value ?? '').trim()))
  if (nonEmptyRows.length > IMPORT_ROW_LIMIT) {
    throw Object.assign(new Error(`Import up to ${IMPORT_ROW_LIMIT} users at a time.`), { status: 400 })
  }

  await ensureSystemRoles()
  const [availableRoles, availableDepartments] = await Promise.all([
    Role.find().select('key name').lean(),
    Department.find().select('key name').lean(),
  ])
  const rolesByName = new Map(availableRoles.flatMap((role) => [
    [normalizeColumnName(role.key), role.key],
    [normalizeColumnName(role.name), role.key],
  ]))
  const departmentsByName = new Map(availableDepartments.flatMap((department) => [
    [normalizeColumnName(department.key), department],
    [normalizeColumnName(department.name), department],
  ]))
  const preparedUsers = []
  const rowErrors = []
  const seenEmails = new Set()

  for (const [index, sourceRow] of nonEmptyRows.entries()) {
    const row = Object.fromEntries(Object.entries(sourceRow).map(([key, value]) => [normalizeColumnName(key), value]))
    const name = String(row.name || row.fullname || '').trim()
    const email = String(row.email || row.emailaddress || '').trim().toLowerCase()
    const password = String(row.password || row.initialpassword || row.temporarypassword || '')
    const roleText = normalizeColumnName(row.role || row.jobrole || 'employee')
    const departmentText = normalizeColumnName(row.department || row.dept || '')
    const verifiedText = normalizeColumnName(row.isverified ?? row.verified ?? '')
    const role = rolesByName.get(roleText)
    const department = departmentText ? departmentsByName.get(departmentText) : null
    const isVerified = !['false', 'no', '0', 'unverified', 'pending'].includes(verifiedText)
    const issues = []

    if (name.length < 2 || name.length > 80) issues.push('Name must be between 2 and 80 characters.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push('Enter a valid email address.')
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) issues.push('Password must be at least 8 characters and no more than 72 bytes.')
    if (!role) issues.push(`Unknown role "${row.role || row.jobrole || 'employee'}".`)
    if (departmentText && !department) issues.push(`Unknown department "${row.department || row.dept}".`)
    if (verifiedText && !['true', 'yes', '1', 'verified', 'false', 'no', '0', 'unverified', 'pending'].includes(verifiedText)) {
      issues.push('Verified must be yes/no or true/false.')
    }
    if (seenEmails.has(email)) issues.push('This email appears more than once in the spreadsheet.')

    if (issues.length) {
      rowErrors.push({ row: index + 2, message: issues.join(' ') })
      continue
    }
    seenEmails.add(email)
    preparedUsers.push({ rowNumber: index + 2, name, email, password, role, department, isVerified })
  }

  if (preparedUsers.length) {
    const existingUsers = await User.find({ email: { $in: preparedUsers.map((user) => user.email) } }).select('email').lean()
    const existingEmails = new Set(existingUsers.map((user) => user.email))
    const usersToCreate = preparedUsers.filter((user) => {
      if (!existingEmails.has(user.email)) return true
      rowErrors.push({ row: user.rowNumber, message: 'An account with this email already exists.' })
      return false
    })

    for (const userDetails of usersToCreate) {
      try {
        const user = await User.create({
          name: userDetails.name,
          email: userDetails.email,
          password: await hashPassword(userDetails.password),
          role: userDetails.role,
          department: userDetails.department?._id || null,
          isVerified: userDetails.isVerified,
        })
        await user.populate('department', 'name')
        userDetails.user = publicUser(user)
      } catch (error) {
        if (error.code === 11000) {
          rowErrors.push({ row: userDetails.rowNumber, message: 'An account with this email already exists.' })
          continue
        }
        throw error
      }
    }
  }

  const createdUsers = preparedUsers.map((user) => user.user).filter(Boolean)
  return { createdUsers, rowErrors }
}

/** Loads users and assignment options for the administrator user-management table. */
export async function listUsers(req, res, next) {
  try {
    await ensureSystemRoles()
    const userFilter = {}
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      userFilter.$or = [{ name: new RegExp(safeSearch, 'i') }, { email: new RegExp(safeSearch, 'i') }]
    }
    const [userPage, roles, departments] = await Promise.all([
      paginateQuery(
        User.find(userFilter)
        .select('name email role department isVerified createdAt updatedAt')
        .populate('department', 'name')
        .sort({ createdAt: -1 }),
        User.countDocuments(userFilter),
        getPaginationOptions(req.query),
      ),
      Role.find().sort({ isSystem: -1, name: 1 }).select('key name isSystem').lean(),
      Department.find().sort({ name: 1 }).select('key name').lean(),
    ])
    return res.json({ users: userPage.items.map(publicUser), pagination: userPage.pagination, roles, departments })
  } catch (error) {
    return next(error)
  }
}

/** Creates an account from the administrator's assignment and verification choices. */
export async function createManagedUser(req, res, next) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const role = typeof req.body?.role === 'string' ? req.body.role : ''
  const departmentId = req.body?.departmentId || null
  const isVerified = req.body?.isVerified === undefined ? true : req.body.isVerified

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ message: 'Name must be between 2 and 80 characters.' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' })
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Initial password must be at least 8 characters and no more than 72 bytes.' })
  }
  if (typeof isVerified !== 'boolean') {
    return res.status(400).json({ message: 'Verification status must be true or false.' })
  }
  if (departmentId && !isValidObjectId(departmentId)) {
    return res.status(400).json({ message: 'Choose a valid department.' })
  }

  try {
    await ensureSystemRoles()
    if (!(await Role.exists({ key: role }))) {
      return res.status(400).json({ message: 'Choose a valid ERP role.' })
    }

    let department = null
    if (departmentId) {
      department = await Department.findById(departmentId)
      if (!department) return res.status(400).json({ message: 'Choose a valid department.' })
    }

    const user = await User.create({
      name,
      email,
      password: await hashPassword(password),
      role,
      department: department?._id || null,
      isVerified,
    })
    await user.populate('department', 'name')
    return res.status(201).json({ user: publicUser(user) })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with that email already exists.' })
    }
    return next(error)
  }
}

/** Imports a capped batch of spreadsheet rows and reports success or a reason per rejected row. */
export async function importManagedUsers(req, res, next) {
  try {
    const result = await createUsersFromRows(req.body?.users)
    return res.status(200).json({
      createdUsers: result.createdUsers,
      createdCount: result.createdUsers.length,
      failedCount: result.rowErrors.length,
      rowErrors: result.rowErrors,
    })
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message })
    return next(error)
  }
}

/** Imports a publicly shared Google Sheet by converting its link to a CSV export URL. */
export async function importUsersFromGoogleSheet(req, res, next) {
  const sheetLink = typeof req.body?.sheetUrl === 'string' ? req.body.sheetUrl.trim() : ''
  let sheetUrl
  try {
    sheetUrl = new URL(sheetLink)
  } catch {
    return res.status(400).json({ message: 'Enter a valid Google Sheets link.' })
  }

  const sheetMatch = sheetUrl.hostname === 'docs.google.com'
    ? sheetUrl.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/.*)?$/)
    : null
  if (!sheetMatch) return res.status(400).json({ message: 'Use a Google Sheets link from docs.google.com.' })

  const hashParameters = new URLSearchParams(sheetUrl.hash.replace(/^#/, ''))
  const sheetTabId = sheetUrl.searchParams.get('gid') || hashParameters.get('gid') || '0'
  if (!/^\d+$/.test(sheetTabId)) return res.status(400).json({ message: 'The Google Sheets tab ID is invalid.' })

  try {
    const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export`)
    exportUrl.searchParams.set('format', 'csv')
    exportUrl.searchParams.set('gid', sheetTabId)
    const response = await fetch(exportUrl, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) {
      return res.status(400).json({ message: 'Google could not open this sheet. Share it as Anyone with the link can view, then try again.' })
    }

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > 2_000_000) return res.status(413).json({ message: 'The Google Sheet export is too large.' })
    const csvText = await response.text()
    if (csvText.length > 2_000_000) return res.status(413).json({ message: 'The Google Sheet export is too large.' })
    if (/^\s*</.test(csvText)) {
      return res.status(400).json({ message: 'Google returned a web page instead of CSV. Make sure the sheet is shared as viewable by anyone with the link.' })
    }

    const result = await createUsersFromRows(parseCsvRows(csvText.replace(/^\uFEFF/, '')))
    return res.status(200).json({
      createdUsers: result.createdUsers,
      createdCount: result.createdUsers.length,
      failedCount: result.rowErrors.length,
      rowErrors: result.rowErrors,
    })
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message })
    return next(error)
  }
}

/** Applies administrator verification, role, and department changes with safeguards. */
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

    const roleChanged = role !== undefined && role !== user.role
    const verificationChanged = isVerified !== undefined && isVerified !== wasVerified
    const departmentChanged = departmentId !== undefined && previousDepartment !== String(department?._id || '')

    if (role !== undefined) user.role = role
    if (isVerified !== undefined) user.isVerified = isVerified
    if (departmentId !== undefined) user.department = department?._id || null
    if (roleChanged || verificationChanged || departmentChanged) {
      user.tokenVersion = (user.tokenVersion ?? 0) + 1
    }
    await user.save()
    await user.populate('department', 'name')
    const becameVerified = !wasVerified && user.isVerified !== false
    const organizationAssignmentChanged = previousRole !== user.role || previousDepartment !== String(user.department?._id || '')
    if (roleChanged) await recordAuditEvent(req, { eventType: 'role_changed', targetUser: user._id, details: { previousRole, newRole: user.role } })
    if (verificationChanged) await recordAuditEvent(req, { eventType: user.isVerified ? 'account_verified' : 'account_suspended', targetUser: user._id, details: { previousVerified: wasVerified, newVerified: user.isVerified } })
    if (departmentChanged) await recordAuditEvent(req, { eventType: 'department_changed', targetUser: user._id, details: { previousDepartment, newDepartment: String(user.department?._id || '') } })
    if (roleChanged || verificationChanged || departmentChanged) await recordAuditEvent(req, { eventType: 'session_revoked', targetUser: user._id, details: { reason: 'account_access_changed' } })
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

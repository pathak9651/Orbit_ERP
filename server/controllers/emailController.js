import EmailLog from '../models/emailLog.js'
import User from '../models/user.js'
import Department from '../models/department.js'
import { sendWorkspaceEmail } from '../services/mailer.js'
import { notifyUsers } from '../services/notifications.js'
import { getPaginationOptions, paginateQuery } from '../utils/pagination.js'

// Bound each group message to keep delivery time and mail-provider load predictable.
const EMAIL_LIMIT = 200

/** Lists verified staff members that the current user is allowed to email. */
export async function listEmailDirectory(req, res, next) {
  try {
    const filter = { isVerified: { $ne: false } }
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [{ name: new RegExp(safeSearch, 'i') }, { email: new RegExp(safeSearch, 'i') }]
    }
    if (typeof req.query.role === 'string' && req.query.role) filter.role = req.query.role === 'employee' ? { $in: ['employee', 'user'] } : req.query.role
    if (typeof req.query.department === 'string' && req.query.department) filter.department = req.query.department
    const result = await paginateQuery(User.find(filter)
      .select('name email role department')
      .populate('department', 'name')
      .sort({ name: 1 })
      .lean(), User.countDocuments(filter), getPaginationOptions(req.query))
    const [roles, departments] = await Promise.all([
      User.distinct('role', { isVerified: { $ne: false } }),
      User.distinct('department', { isVerified: { $ne: false }, department: { $ne: null } }),
    ])
    const departmentNames = await Department.find({ _id: { $in: departments } }).select('name').sort({ name: 1 }).lean()
    return res.json({ users: result.items.map(({ _id, name, email, role, department }) => ({
      id: String(_id), name, email, role: role === 'user' ? 'employee' : role,
      department: department?.name || '', departmentId: department ? String(department._id) : '',
    })), pagination: result.pagination, roles: roles.map((role) => role === 'user' ? 'employee' : role), departments: departmentNames.map(({ _id, name }) => ({ id: String(_id), name })) })
  } catch (error) { return next(error) }
}

/** Sends a message to selected workspace members and records delivery status. */
export async function sendEmail(req, res, next) {
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : ''
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  const recipientIds = Array.isArray(req.body?.recipientIds) ? [...new Set(req.body.recipientIds)] : []
  if (!subject || subject.length > 180) return res.status(400).json({ message: 'Enter a subject (up to 180 characters).' })
  if (!message || message.length > 20000) return res.status(400).json({ message: 'Enter a message (up to 20,000 characters).' })
  if (!recipientIds.length) return res.status(400).json({ message: 'Choose at least one recipient.' })
  if (recipientIds.length > EMAIL_LIMIT) return res.status(400).json({ message: `You can email up to ${EMAIL_LIMIT} recipients at a time.` })
  if (recipientIds.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) return res.status(400).json({ message: 'One or more recipients are invalid.' })

  try {
    const users = await User.find({ _id: { $in: recipientIds }, isVerified: { $ne: false } })
      .select('name email role department')
      .populate('department', 'name')
    if (users.length !== recipientIds.length) return res.status(400).json({ message: 'One or more selected users are unavailable. Refresh the directory and try again.' })
    const recipients = users.map((user) => ({ user: user._id, name: user.name, email: user.email, role: user.role === 'user' ? 'employee' : user.role, department: user.department?.name || '' }))
    const log = await EmailLog.create({ sender: req.user._id, recipients, subject, message, status: 'failed', error: 'Delivery has not completed.' })
    try {
      const result = await sendWorkspaceEmail({ recipients, subject, message })
      log.status = result.rejected.length ? (result.accepted.length ? 'partial' : 'failed') : 'sent'
      log.error = result.rejected.length ? `Delivery rejected for ${result.rejected.length} recipient(s).` : ''
      log.sentAt = new Date()
      await log.save()
      const acceptedEmails = new Set(result.accepted.map((address) => String(typeof address === 'string' ? address : address.address).toLowerCase()))
      await notifyUsers(recipients.filter((recipient) => acceptedEmails.has(recipient.email.toLowerCase())).map((recipient) => recipient.user), {
        actorId: req.user._id, actorName: req.user.name, type: 'email', title: 'New email received',
        message: `${req.user.name} sent you an email: “${subject}”.`, page: 'email', entityId: String(log._id),
      })
      const deliveryMessage = result.rejected.length
        ? `Email accepted for ${result.accepted.length} recipient(s); ${result.rejected.length} could not be reached.`
        : `Email sent to ${result.accepted.length} ${result.accepted.length === 1 ? 'person' : 'people'}.`
      return res.status(201).json({ message: deliveryMessage, email: { id: log.id, recipientCount: recipients.length, sentAt: log.sentAt, acceptedCount: result.accepted.length, rejectedCount: result.rejected.length } })
    } catch (error) {
      log.error = String(error.message || 'Email delivery failed.').slice(0, 500)
      await log.save()
      if (error.status === 503) return res.status(503).json({ message: error.message })
      console.error('Email delivery failed:', { code: error.code, responseCode: error.responseCode, message: error.message })
      if (error.code === 'EAUTH' || error.responseCode === 535) {
        return res.status(502).json({ message: 'SMTP authentication failed. Verify SMTP_USER and use a valid app password for your mail provider.' })
      }
      if (['ECONNECTION', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ESOCKET'].includes(error.code)) {
        return res.status(502).json({ message: 'Could not connect to the SMTP server. Verify SMTP_HOST, SMTP_PORT, and your network connection.' })
      }
      return res.status(502).json({ message: 'The SMTP server rejected this email. Check the sender address and mail provider settings.' })
    }
  } catch (error) { return next(error) }
}

/** Returns the signed-in user's recent sent-message history. */
export async function listSentEmails(req, res, next) {
  try {
    const filter = req.user.role === 'admin' ? {} : { sender: req.user._id }
    const result = await paginateQuery(EmailLog.find(filter).populate('sender', 'name email role').sort({ createdAt: -1 }).lean(), EmailLog.countDocuments(filter), getPaginationOptions(req.query))
    return res.json({ emails: result.items.map((item) => ({
      id: String(item._id), subject: item.subject, message: item.message, status: item.status,
      sender: item.sender ? { name: item.sender.name, email: item.sender.email, role: item.sender.role } : null,
      sentAt: item.sentAt, createdAt: item.createdAt, error: item.status === 'failed' ? item.error : '',
      recipients: item.recipients.map(({ name, email, role, department }) => ({ name, email, role, department })),
    })), pagination: result.pagination })
  } catch (error) { return next(error) }
}

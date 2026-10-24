import { createHash, randomBytes } from 'node:crypto'
import AuditEvent from '../models/auditEvent.js'
import PasswordResetToken from '../models/passwordResetToken.js'
import User from '../models/user.js'
import { hashPassword } from '../services/auth.js'
import { recordAuditEvent } from '../services/audit.js'
import { sendWorkspaceEmail } from '../services/mailer.js'
import { getPaginationOptions, paginateQuery } from '../utils/pagination.js'

const RESET_MESSAGE = 'If an account exists for that email, password reset instructions will be sent shortly.'
const RESET_TOKEN_LIFETIME_MS = 15 * 60 * 1000
const hashToken = (value) => createHash('sha256').update(value).digest('hex')

async function recordSafely(req, event) {
  try { await recordAuditEvent(req, event) }
  catch (error) { console.error('Security audit write failed:', error.message) }
}

function resetLink(token) {
  const frontendOrigin = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].trim()
  return `${frontendOrigin.replace(/\/$/, '')}/?resetToken=${encodeURIComponent(token)}`
}

/** Always returns the same response while emailing a random, hashed, short-lived reset token when an account exists. */
export async function requestPasswordReset(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  try {
    const user = await User.findOne({ email, isVerified: { $ne: false } }).select('name email')
    if (user) {
      await PasswordResetToken.deleteMany({ user: user._id })
      const rawToken = randomBytes(32).toString('base64url')
      await PasswordResetToken.create({ user: user._id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + RESET_TOKEN_LIFETIME_MS) })
      try {
        await sendWorkspaceEmail({ recipients: [{ email: user.email }], subject: 'Reset your Orbit ERP password', message: `Hello ${user.name},\n\nUse this link within 15 minutes to reset your password:\n${resetLink(rawToken)}\n\nIf you did not request this, you can ignore this email.` })
        await recordSafely(req, { eventType: 'password_reset_requested', outcome: 'requested', targetUser: user._id })
      } catch (error) {
        console.error('Password reset email delivery failed:', error.message)
        await recordSafely(req, { eventType: 'password_reset_email_failed', outcome: 'failure', targetUser: user._id })
      }
    }
  } catch (error) {
    console.error('Password reset request failed:', error.message)
  }
  return res.status(202).json({ message: RESET_MESSAGE })
}

/** Consumes a reset token exactly once, updates the bcrypt password, and revokes every prior session. */
export async function resetPassword(req, res, next) {
  res.setHeader('Cache-Control', 'no-store')
  const token = typeof req.body?.token === 'string' ? req.body.token : ''
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''
  if (newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) return res.status(400).json({ message: 'Choose a password between 8 characters and 72 bytes.' })
  try {
    const record = await PasswordResetToken.findOneAndUpdate(
      { tokenHash: hashToken(token), consumedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { consumedAt: new Date() } },
      { returnDocument: 'after' },
    )
    if (!record) {
      await recordSafely(req, { eventType: 'password_reset', outcome: 'failure' })
      return res.status(400).json({ message: 'This password reset link is invalid or expired. Request a new link.' })
    }
    const user = await User.findById(record.user).select('+password')
    if (!user) return res.status(400).json({ message: 'This password reset link is invalid or expired. Request a new link.' })
    user.password = await hashPassword(newPassword)
    user.tokenVersion = (user.tokenVersion || 0) + 1
    await user.save()
    await PasswordResetToken.deleteMany({ user: user._id })
    await recordSafely(req, { eventType: 'password_reset', targetUser: user._id })
    await recordSafely(req, { eventType: 'session_revoked', targetUser: user._id, details: { reason: 'password_reset' } })
    return res.json({ message: 'Your password has been reset. Sign in with your new password.' })
  } catch (error) { return next(error) }
}

/** Returns a paginated, read-only security-event feed for administrators. */
export async function listAuditEvents(req, res, next) {
  try {
    res.setHeader('Cache-Control', 'no-store')
    const page = await paginateQuery(AuditEvent.find().populate('actor', 'name email').populate('targetUser', 'name email').sort({ createdAt: -1 }), AuditEvent.countDocuments(), getPaginationOptions(req.query))
    return res.json({ events: page.items, pagination: page.pagination })
  } catch (error) { return next(error) }
}



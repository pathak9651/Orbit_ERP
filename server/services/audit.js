import AuditEvent from '../models/auditEvent.js'

const safeDetailKeys = new Set(['previousRole', 'newRole', 'previousVerified', 'newVerified', 'previousDepartment', 'newDepartment', 'invoiceNumber', 'status', 'reason', 'conversationId', 'conversationType'])

/** Stores a minimal security event without credentials, tokens, or arbitrary request payloads. */
export async function recordAuditEvent(req, { eventType, outcome = 'success', targetUser = null, details = {} }) {
  const safeDetails = Object.fromEntries(Object.entries(details).filter(([key]) => safeDetailKeys.has(key)))
  await AuditEvent.create({
    actor: req?.user?._id || null,
    targetUser,
    eventType,
    outcome,
    ipAddress: String(req?.ip || '').slice(0, 64),
    userAgent: String(req?.get?.('user-agent') || '').slice(0, 300),
    details: safeDetails,
  })
}

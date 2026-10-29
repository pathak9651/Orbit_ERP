import AuditEvent from '../models/auditEvent.js'

const safeDetailKeys = new Set(['previousRole', 'newRole', 'previousVerified', 'newVerified', 'previousDepartment', 'newDepartment', 'invoiceNumber', 'status', 'reason', 'conversationId', 'conversationType', 'customerId', 'inventoryItemId', 'revenueTransactionId', 'transactionType', 'category', 'amount', 'quantity', 'reorderLevel', 'recordCount', 'impersonationReason', 'requestMethod', 'requestPath'])

/** Stores a minimal security event without credentials, tokens, or arbitrary request payloads. */
export async function recordAuditEvent(req, { eventType, outcome = 'success', targetUser = null, details = {} }) {
  const safeDetails = Object.fromEntries(Object.entries(details).filter(([key]) => safeDetailKeys.has(key)))
  await AuditEvent.create({
    actor: req?.auth?.actorId || req?.user?._id || null,
    targetUser: targetUser || (req?.auth?.isImpersonating ? req.user._id : null),
    eventType,
    outcome,
    ipAddress: String(req?.ip || '').slice(0, 64),
    userAgent: String(req?.get?.('user-agent') || '').slice(0, 300),
    details: safeDetails,
  })
}

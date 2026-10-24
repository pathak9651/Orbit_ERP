import mongoose from 'mongoose'

// Security history is append-only through the application and excludes credentials and tokens.
const auditEventSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  eventType: { type: String, required: true, index: true, maxlength: 80 },
  outcome: { type: String, enum: ['success', 'failure', 'requested'], default: 'success' },
  ipAddress: { type: String, maxlength: 64, default: '' },
  userAgent: { type: String, maxlength: 300, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } })

auditEventSchema.pre('save', function rejectAuditRewrite() {
  if (!this.isNew) throw new Error('Audit events cannot be changed.')
})

for (const operation of ['findOneAndUpdate', 'findOneAndReplace', 'updateOne', 'updateMany', 'replaceOne', 'findOneAndDelete', 'deleteOne', 'deleteMany']) {
  auditEventSchema.pre(operation, function rejectAuditMutation() { throw new Error('Audit events cannot be changed or deleted.') })
}

export default mongoose.model('AuditEvent', auditEventSchema)

import mongoose from 'mongoose'

// Tracks short-lived administrator impersonation sessions so each can be revoked independently.
const impersonationSessionSchema = new mongoose.Schema({
  sessionIdHash: { type: String, required: true, unique: true, select: false },
  administrator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null, index: true },
}, { timestamps: true })

export default mongoose.model('ImpersonationSession', impersonationSessionSchema)

import mongoose from 'mongoose'

// Stores only a single-use reset-token digest and lets MongoDB remove expired records.
const passwordResetTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, expires: 0 },
  consumedAt: { type: Date, default: null },
}, { timestamps: true })

export default mongoose.model('PasswordResetToken', passwordResetTokenSchema)

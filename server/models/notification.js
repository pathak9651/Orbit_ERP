import mongoose from 'mongoose'

// Stores per-recipient activity so each user can independently read or clear notifications.
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorName: { type: String, default: '' },
  type: { type: String, enum: ['task', 'email', 'attendance', 'account', 'leave', 'calendar', 'inventory', 'system'], default: 'system' },
  title: { type: String, required: true, maxlength: 120 },
  message: { type: String, required: true, maxlength: 500 },
  page: { type: String, default: 'overview', maxlength: 40 },
  entityId: { type: String, default: '' },
  readAt: { type: Date, default: null, index: true },
}, { timestamps: true })

notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 })

export default mongoose.model('Notification', notificationSchema)

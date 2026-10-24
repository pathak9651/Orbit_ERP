import mongoose from 'mongoose'

// Persists recipients and delivery results so users can review sent workspace messages.
const emailLogSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipients: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true },
    department: { type: String, default: '' },
  }],
  subject: { type: String, required: true, trim: true, maxlength: 180 },
  message: { type: String, required: true, maxlength: 20000 },
  status: { type: String, enum: ['sent', 'partial', 'failed'], required: true },
  sentAt: { type: Date, default: Date.now },
  error: { type: String, maxlength: 500, default: '' },
}, { timestamps: true })

export default mongoose.model('EmailLog', emailLogSchema)

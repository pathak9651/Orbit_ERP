import mongoose from 'mongoose'

// Persists bounded plain-text messages and the members who have read them.
const chatMessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatConversation', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 4000 },
  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true })

chatMessageSchema.index({ conversation: 1, createdAt: -1 })
export default mongoose.model('ChatMessage', chatMessageSchema)

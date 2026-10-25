import mongoose from 'mongoose'

// Stores a direct conversation or one shared room for a department.
const chatConversationSchema = new mongoose.Schema({
  type: { type: String, enum: ['direct', 'department'], required: true, index: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
  directKey: { type: String, default: null, unique: true, sparse: true },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
  lastMessageAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true })

chatConversationSchema.index({ participants: 1, lastMessageAt: -1 })
chatConversationSchema.index({ type: 1, department: 1 }, { unique: true, partialFilterExpression: { type: 'department' } })

export default mongoose.model('ChatConversation', chatConversationSchema)

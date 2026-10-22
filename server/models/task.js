import mongoose from 'mongoose'

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
  dueDate: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending', index: true },
}, { timestamps: true })

taskSchema.index({ assignedTo: 1, createdAt: -1 })
export default mongoose.model('Task', taskSchema)

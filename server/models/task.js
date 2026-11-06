import mongoose from 'mongoose'

// Stores ownership and workflow state so task lists can be scoped by assignee and department.
const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Keep the employee whose duties are covered separate from the real assignee.
  coveringFor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  coverageLeave: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest', default: null },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  completedAt: { type: Date, default: null },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
  dueDate: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending', index: true },
}, { timestamps: true })

taskSchema.index({ assignedTo: 1, createdAt: -1 })
export default mongoose.model('Task', taskSchema)

import mongoose from 'mongoose'

// Each review action is retained so a request has an auditable approval trail.
const leaveHistorySchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, required: true },
  action: { type: String, enum: ['submitted', 'forwarded', 'approved', 'rejected'], required: true },
  message: { type: String, trim: true, maxlength: 1000, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { _id: false })

// The current stage routes a pending request upward through manager, HR, and admin.
const leaveRequestSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
  leaveType: { type: String, enum: ['annual', 'sick', 'personal', 'unpaid'], required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  reason: { type: String, trim: true, required: true, minlength: 3, maxlength: 1000 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  currentStage: { type: String, enum: ['manager', 'hr', 'admin', null], default: 'manager', index: true },
  history: { type: [leaveHistorySchema], default: [] },
}, { timestamps: true })

leaveRequestSchema.index({ status: 1, currentStage: 1, department: 1, createdAt: 1 })
export default mongoose.model('LeaveRequest', leaveRequestSchema)

import mongoose from 'mongoose'

// Lower level values represent less authority; assignment and approval flows use this ranking.
export const SYSTEM_ROLES = [
  { key: 'admin', name: 'Admin', level: 100 },
  { key: 'hr', name: 'HR', level: 80 },
  { key: 'manager', name: 'Manager', level: 60 },
  { key: 'accountant', name: 'Accountant', level: 20 },
  { key: 'employee', name: 'Employee', level: 10 },
  { key: 'housekeeping', name: 'Housekeeping', level: 10 },
]

// Custom roles share the same hierarchy field as built-in roles for consistent authorization.
const roleSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
  isSystem: { type: Boolean, default: false },
  level: { type: Number, min: 0, max: 100, default: 10 },
}, { timestamps: true })

const Role = mongoose.model('Role', roleSchema)
export default Role

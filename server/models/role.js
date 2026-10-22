import mongoose from 'mongoose'

export const SYSTEM_ROLES = [
  { key: 'admin', name: 'Admin', level: 100 },
  { key: 'hr', name: 'HR', level: 80 },
  { key: 'manager', name: 'Manager', level: 60 },
  { key: 'accountant', name: 'Accountant', level: 20 },
  { key: 'employee', name: 'Employee', level: 10 },
  { key: 'housekeeping', name: 'Housekeeping', level: 10 },
]

const roleSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
  isSystem: { type: Boolean, default: false },
  level: { type: Number, min: 0, max: 100, default: 10 },
}, { timestamps: true })

const Role = mongoose.model('Role', roleSchema)
export default Role

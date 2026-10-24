import mongoose from 'mongoose'

// Department names group members and constrain manager actions to their own team.
const departmentSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
}, { timestamps: true })

departmentSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } })

const Department = mongoose.model('Department', departmentSchema)
export default Department

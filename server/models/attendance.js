import mongoose from 'mongoose'

const checkInLocationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  accuracyMeters: { type: Number, min: 0, default: null },
}, { _id: false })

const attendanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateKey: { type: String, required: true },
  checkIn: { type: Date, required: true },
  checkInLocation: { type: checkInLocationSchema, default: null },
  checkOut: { type: Date, default: null },
}, { timestamps: true })

attendanceSchema.index({ user: 1, dateKey: 1 }, { unique: true })
attendanceSchema.index({ dateKey: -1 })
export default mongoose.model('Attendance', attendanceSchema)

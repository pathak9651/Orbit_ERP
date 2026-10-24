import mongoose from 'mongoose'

// GPS coordinates are optional; when present, validate their geographic ranges.
const checkInLocationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  accuracyMeters: { type: Number, min: 0, default: null },
  // The device timestamp is untrusted evidence; recordedAt always comes from the server.
  clientReportedAt: { type: Date, default: null },
  recordedAt: { type: Date, default: null },
}, { _id: false })

const locationCorrectionSchema = new mongoose.Schema({
  location: { type: checkInLocationSchema, required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  requestedAt: { type: Date, required: true, default: Date.now },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewMessage: { type: String, maxlength: 1000, default: '' },
}, { _id: false })

// One record per employee and business date makes duplicate check-ins impossible.
const attendanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateKey: { type: String, required: true },
  checkIn: { type: Date, required: true },
  checkInLocation: { type: checkInLocationSchema, default: null },
  locationFlags: { type: [String], default: [] },
  locationExceptionReason: { type: String, maxlength: 1000, default: '' },
  locationReviewStatus: { type: String, enum: ['clear', 'pending', 'reviewed'], default: 'clear' },
  locationReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  locationReviewedAt: { type: Date, default: null },
  locationReviewNote: { type: String, maxlength: 1000, default: '' },
  locationCorrection: { type: locationCorrectionSchema, default: null },
  checkOut: { type: Date, default: null },
}, { timestamps: true })

attendanceSchema.index({ user: 1, dateKey: 1 }, { unique: true })
attendanceSchema.index({ dateKey: -1 })
attendanceSchema.index({ checkIn: 1 })
export default mongoose.model('Attendance', attendanceSchema)

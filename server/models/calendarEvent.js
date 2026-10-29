import mongoose from 'mongoose'

// Stores company holidays, events, and meetings with a durable reminder schedule.
const calendarEventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  description: { type: String, default: '', maxlength: 2000 },
  type: { type: String, enum: ['holiday', 'event', 'meeting'], required: true, index: true },
  startAt: { type: Date, required: true, index: true },
  endAt: { type: Date, required: true },
  allDay: { type: Boolean, default: false },
  location: { type: String, default: '', maxlength: 200 },
  reminderMinutes: { type: Number, enum: [0, 5, 15, 30, 60, 1440], default: 15 },
  reminderAt: { type: Date, default: null, index: true },
  reminderSentAt: { type: Date, default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

calendarEventSchema.index({ startAt: 1, endAt: 1 })

export default mongoose.model('CalendarEvent', calendarEventSchema)

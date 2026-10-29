import mongoose from 'mongoose'

// Stores a CRM contact and the company relationship details used by administrators.
const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  company: { type: String, trim: true, maxlength: 120, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['lead', 'prospect', 'customer', 'inactive'], default: 'lead', index: true },
  source: { type: String, trim: true, maxlength: 80, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

customerSchema.index({ createdAt: -1 })
customerSchema.index({ name: 1, company: 1 })

export default mongoose.model('Customer', customerSchema)

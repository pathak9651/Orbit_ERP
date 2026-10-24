import mongoose from 'mongoose'

// Embedded line items keep the invoice calculation and its printed details together.
const invoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true, maxlength: 160 },
  quantity: { type: Number, required: true, min: 0.01, max: 100000 },
  unitPrice: { type: Number, required: true, min: 0, max: 100000000 },
  lineTotal: { type: Number, required: true, min: 0 },
}, { _id: false })

// Stores customer-facing invoice data, delivery state, and a history of status changes.
const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true, index: true },
  customerName: { type: String, required: true, trim: true, maxlength: 120 },
  customerEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  items: { type: [invoiceItemSchema], required: true, validate: [(items) => items.length > 0 && items.length <= 10, 'An invoice needs between 1 and 10 line items.'] },
  total: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR', enum: ['INR'] },
  dueDate: { type: Date, required: true },
  status: { type: String, required: true, enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'], default: 'draft', index: true },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  emailStatus: { type: String, enum: ['not-sent', 'pending', 'sent', 'failed'], default: 'not-sent' },
  emailSentAt: { type: Date, default: null },
  emailError: { type: String, maxlength: 300, default: '' },
  statusHistory: [{
    status: { type: String, enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'], required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true })

invoiceSchema.index({ createdAt: -1 })
export default mongoose.model('Invoice', invoiceSchema)

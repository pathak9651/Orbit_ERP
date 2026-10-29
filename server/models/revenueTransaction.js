import mongoose from 'mongoose'

// Keeps the actual income, expenditure, refunds, and transfers entered by finance staff.
const revenueTransactionSchema = new mongoose.Schema({
  transactionType: { type: String, required: true, enum: ['income', 'expense', 'refund', 'transfer'], index: true },
  category: { type: String, required: true, trim: true, maxlength: 60, index: true },
  amount: { type: Number, required: true, min: 0.01, max: 1000000000000 },
  currency: { type: String, required: true, enum: ['INR'], default: 'INR' },
  transactionDate: { type: Date, required: true, index: true },
  status: { type: String, required: true, enum: ['cleared', 'pending', 'voided'], default: 'cleared', index: true },
  paymentMethod: { type: String, required: true, enum: ['bank-transfer', 'upi', 'card', 'cash', 'cheque', 'other'], default: 'bank-transfer' },
  counterparty: { type: String, trim: true, maxlength: 120, default: '' },
  reference: { type: String, trim: true, maxlength: 100, default: '' },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

revenueTransactionSchema.index({ transactionDate: -1, createdAt: -1 })
revenueTransactionSchema.index({ transactionType: 1, status: 1, transactionDate: -1 })
revenueTransactionSchema.index({ category: 1, transactionDate: -1 })

export default mongoose.model('RevenueTransaction', revenueTransactionSchema)

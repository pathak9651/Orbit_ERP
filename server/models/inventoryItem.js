import mongoose from 'mongoose'

// Stores office stock counts and the threshold at which administrators should reorder.
const inventoryItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120, index: true },
  category: { type: String, required: true, trim: true, maxlength: 80, index: true },
  sku: { type: String, trim: true, uppercase: true, maxlength: 40, default: '' },
  quantity: { type: Number, required: true, min: 0, max: 1000000 },
  reorderLevel: { type: Number, required: true, min: 0, max: 1000000 },
  unit: { type: String, required: true, trim: true, maxlength: 30, default: 'units' },
  location: { type: String, trim: true, maxlength: 120, default: '' },
  supplier: { type: String, trim: true, maxlength: 120, default: '' },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

inventoryItemSchema.index({ category: 1, name: 1 })
inventoryItemSchema.index({ quantity: 1, reorderLevel: 1 })

export default mongoose.model('InventoryItem', inventoryItemSchema)

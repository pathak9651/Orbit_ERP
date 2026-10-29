import mongoose from 'mongoose'

// Keeps document metadata and bounded private file bytes in the shared database for every app instance.
const documentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  originalName: { type: String, required: true, maxlength: 180 },
  // Kept for backward compatibility with files uploaded before binary storage was added.
  storageKey: { type: String, select: false },
  fileData: { type: Buffer, select: false },
  contentType: { type: String, required: true, maxlength: 120 },
  size: { type: Number, required: true, min: 1, max: 15 * 1024 * 1024 },
  description: { type: String, default: '', maxlength: 500 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true })

documentSchema.index({ createdAt: -1, _id: -1 })

export default mongoose.model('Document', documentSchema)

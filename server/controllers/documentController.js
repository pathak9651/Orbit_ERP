import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Document from '../models/document.js'
import { recordAuditEvent } from '../services/audit.js'
import { DOCUMENT_UPLOAD_TYPES, validateDocumentUpload } from '../utils/validation.js'
import { getPaginationOptions, paginateQuery } from '../utils/pagination.js'

const controllerDirectory = path.dirname(fileURLToPath(import.meta.url))
const privateDocumentDirectory = path.resolve(controllerDirectory, '../storage/documents')

/** Records document activity without allowing an audit failure to hide a completed file operation. */
async function recordDocumentAudit(req, event) {
  try { await recordAuditEvent(req, event) }
  catch (error) { console.error('Document audit write failed:', error.message) }
}

/** Returns only document metadata that is safe to show in the shared document library. */
function toPublicDocument(document) {
  return {
    id: String(document._id),
    title: document.title,
    originalName: document.originalName,
    contentType: document.contentType,
    size: document.size,
    description: document.description,
    uploadedBy: document.uploadedBy ? { id: String(document.uploadedBy._id), name: document.uploadedBy.name } : null,
    createdAt: document.createdAt,
  }
}

/** Loads a document's shared bytes, migrating older private disk files when they are still available. */
async function getDocumentContents(document) {
  if (Buffer.isBuffer(document.fileData) && document.fileData.length) return document.fileData
  if (!/^[\da-f-]{36}\.[a-z0-9]+$/i.test(document.storageKey || '')) return null

  const storagePath = path.join(privateDocumentDirectory, document.storageKey)
  let fileContents
  try { fileContents = await readFile(storagePath) }
  catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  try { await Document.updateOne({ _id: document._id }, { $set: { fileData: fileContents } }) }
  catch (error) { console.error('Could not migrate a legacy document into shared storage:', error.message) }
  return fileContents
}

/** Lists the shared company library with server-side pagination for every authenticated role. */
export async function listDocuments(req, res, next) {
  try {
    const page = await paginateQuery(
      Document.find().select('-storageKey').populate('uploadedBy', 'name').sort({ createdAt: -1, _id: -1 }),
      Document.countDocuments(),
      getPaginationOptions(req.query),
    )
    return res.json({ documents: page.items.map(toPublicDocument), pagination: page.pagination })
  } catch (error) { return next(error) }
}

/** Saves an administrator's validated file bytes and metadata in the shared MongoDB database. */
export async function uploadDocument(req, res, next) {
  const originalName = typeof req.query.filename === 'string'
    ? path.basename(req.query.filename.replaceAll('\\', '/')).normalize('NFC').trim()
    : ''
  const description = typeof req.query.description === 'string' ? req.query.description.trim() : ''
  const contentType = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase()
  const validationMessage = validateDocumentUpload(req.body, contentType, originalName)
  if (validationMessage) return res.status(400).json({ message: validationMessage })
  if (description.length > 500) return res.status(400).json({ message: 'Document descriptions must be 500 characters or fewer.' })

  const extension = path.extname(originalName).toLowerCase()
  try {
    const title = path.basename(originalName, extension).slice(0, 160) || 'Company document'
    const document = await Document.create({
      title,
      originalName,
      fileData: req.body,
      contentType: DOCUMENT_UPLOAD_TYPES[extension],
      size: req.body.length,
      description,
      uploadedBy: req.user.id,
    })
    await recordDocumentAudit(req, { eventType: 'document_uploaded', targetUser: req.user.id })
    await document.populate('uploadedBy', 'name')
    return res.status(201).json({ document: toPublicDocument(document), message: 'Document uploaded.' })
  } catch (error) { return next(error) }
}

/** Downloads the shared file bytes after authentication; older local files remain supported during migration. */
export async function downloadDocument(req, res, next) {
  try {
    const document = await Document.findById(req.params.id).select('+storageKey +fileData')
    if (!document) return res.status(404).json({ message: 'Document not found.' })
    const fileContents = await getDocumentContents(document)
    if (!fileContents) return res.status(404).json({ message: 'Document file is unavailable.' })

    const safeAsciiFilename = document.originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
      'Content-Length': String(fileContents.length),
      'Content-Type': 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    })
    await recordDocumentAudit(req, { eventType: 'document_downloaded', targetUser: document.uploadedBy })
    return res.send(fileContents)
  } catch (error) { return next(error) }
}

/** Returns a safe in-browser preview to authenticated roles without granting the download route. */
export async function viewDocument(req, res, next) {
  try {
    const document = await Document.findById(req.params.id).select('+storageKey +fileData')
    if (!document) return res.status(404).json({ message: 'Document not found.' })
    const readableTypes = new Set(['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
    if (!readableTypes.has(document.contentType)) {
      return res.status(415).json({ message: 'In-browser reading is available for PDF, text, and XLSX files. Ask an administrator for a PDF preview of this file.' })
    }
    const fileContents = await getDocumentContents(document)
    if (!fileContents) return res.status(404).json({ message: 'Document file is unavailable.' })

    const isPdf = document.contentType === 'application/pdf'
    const filename = encodeURIComponent(document.originalName)
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename*=UTF-8''${filename}`,
      'Content-Length': String(fileContents.length),
      'Content-Type': isPdf ? 'application/pdf' : document.contentType === 'text/plain' ? 'text/plain; charset=utf-8' : document.contentType,
      'X-Content-Type-Options': 'nosniff',
    })
    await recordDocumentAudit(req, { eventType: 'document_viewed', targetUser: document.uploadedBy })
    return res.send(fileContents)
  } catch (error) { return next(error) }
}

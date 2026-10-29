import test from 'node:test'
import assert from 'node:assert/strict'
import AuditEvent from '../models/auditEvent.js'
import Document from '../models/document.js'
import { downloadDocument } from '../controllers/documentController.js'
import { authorizeRoles } from '../middlewares/auth.js'
import { MAX_DOCUMENT_UPLOAD_BYTES, validateDocumentUpload } from '../utils/validation.js'

test('document upload validation accepts supported signatures and UTF-8 text', () => {
  assert.equal(validateDocumentUpload(Buffer.from('%PDF-1.7'), 'application/pdf', 'policy.pdf'), '')
  assert.equal(validateDocumentUpload(Buffer.from('Orbit policies'), 'text/plain', 'policy.txt'), '')
  assert.equal(validateDocumentUpload(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'application/msword', 'policy.doc'), '')
  assert.equal(validateDocumentUpload(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'policy.docx'), '')
})

test('document upload validation rejects spoofed, unsupported, empty, and oversized files', () => {
  assert.match(validateDocumentUpload(Buffer.from('<script>'), 'application/pdf', 'policy.pdf'), /contents do not match/)
  assert.match(validateDocumentUpload(Buffer.from('%PDF-1.7'), 'text/html', 'policy.pdf'), /supported PDF/)
  assert.match(validateDocumentUpload(Buffer.from([0xff, 0xfe]), 'text/plain', 'policy.txt'), /contents do not match/)
  assert.match(validateDocumentUpload(Buffer.alloc(0), 'application/pdf', 'policy.pdf'), /Choose a document/)
  assert.match(validateDocumentUpload(Buffer.alloc(MAX_DOCUMENT_UPLOAD_BYTES + 1), 'application/pdf', 'policy.pdf'), /15 MB or smaller/)
  assert.match(validateDocumentUpload(Buffer.from('%PDF-1.7'), 'application/pdf', '../policy.pdf'), /valid document filename/)
  assert.match(validateDocumentUpload(Buffer.from('%PDF-1.7'), 'application/pdf', 'page.html'), /supported PDF/)
})

test('an administrator can download shared MongoDB document bytes', async (context) => {
  const expectedFile = Buffer.from('%PDF-1.7 shared file')
  const sharedDocument = {
    _id: '64b000000000000000000001',
    originalName: 'policy.pdf',
    fileData: expectedFile,
    uploadedBy: '64b000000000000000000002',
  }
  context.mock.method(Document, 'findById', () => ({ select: async () => sharedDocument }))
  context.mock.method(AuditEvent, 'create', async () => ({}))

  const response = { statusCode: 200, headers: {}, body: null }
  const expressResponse = {
    set(headers) { response.headers = headers; return this },
    status(statusCode) { response.statusCode = statusCode; return this },
    send(body) { response.body = body; return this },
  }
  await downloadDocument({ params: { id: sharedDocument._id }, user: { role: 'admin' }, ip: '127.0.0.1', get: () => '' }, expressResponse, (error) => { throw error })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body, expectedFile)
  assert.equal(response.headers['Content-Disposition'].includes('policy.pdf'), true)
  assert.equal(response.headers['Content-Type'], 'application/octet-stream')
})

test('the document download role guard denies non-admin users and permits administrators', () => {
  const guard = authorizeRoles('admin')
  const runGuard = (role) => {
    const result = { statusCode: 200, body: null, continued: false }
    const response = {
      status(statusCode) { result.statusCode = statusCode; return this },
      json(body) { result.body = body; return this },
    }
    guard({ user: { role } }, response, () => { result.continued = true })
    return result
  }

  assert.equal(runGuard('employee').statusCode, 403)
  assert.equal(runGuard('manager').statusCode, 403)
  assert.equal(runGuard('admin').continued, true)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { validateClientForm, validateDocumentFile, validateProfileImageFile, validateSpreadsheetFile } from './validation.js'
import { getChatMessageStatus, shouldShowOffPageChatNotification } from './chat.js'

test('client profile image checks allow supported images and reject unsafe or oversized files', () => {
  assert.equal(validateProfileImageFile({ type: 'image/webp', size: 120_000 }), '')
  assert.match(validateProfileImageFile({ type: 'image/svg+xml', size: 500 }), /JPEG, PNG, or WebP/)
  assert.match(validateProfileImageFile({ type: 'image/png', size: 1_572_865 }), /1.5 MB or smaller/)
  assert.match(validateProfileImageFile(null), /Choose a profile image/)
})

test('spreadsheet upload validation accepts an XLSX ZIP signature', async () => {
  const file = {
    name: 'users.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 32,
    slice: () => ({ arrayBuffer: async () => Uint8Array.from([0x50, 0x4b, 0x03, 0x04]).buffer }),
  }

  assert.equal(await validateSpreadsheetFile(file), '')
})

test('spreadsheet upload validation rejects incorrect name, type, size, and signature', async () => {
  const createFile = (overrides = {}) => ({
    name: 'users.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 32,
    slice: () => ({ arrayBuffer: async () => Uint8Array.from([0x50, 0x4b, 0x03, 0x04]).buffer }),
    ...overrides,
  })

  assert.match(await validateSpreadsheetFile(createFile({ name: 'users.csv' })), /\.xlsx/)
  assert.match(await validateSpreadsheetFile(createFile({ type: 'text/html' })), /file type is not supported/)
  assert.match(await validateSpreadsheetFile(createFile({ size: 0 })), /spreadsheet is empty/)
  assert.match(await validateSpreadsheetFile(createFile({ size: 5 * 1024 * 1024 + 1 })), /smaller than 5 MB/)
  assert.match(await validateSpreadsheetFile(createFile({ slice: () => ({ arrayBuffer: async () => Uint8Array.from([0x3c, 0x68, 0x74, 0x6d]).buffer }) })), /not a valid \.xlsx/)
})

test('document upload validation accepts a PDF and rejects spoofed, oversized, and unsupported files', async () => {
  const createFile = (overrides = {}) => ({
    name: 'policy.pdf',
    type: 'application/pdf',
    size: 32,
    slice: () => ({ arrayBuffer: async () => new TextEncoder().encode('%PDF-1.7').buffer }),
    ...overrides,
  })

  assert.equal(await validateDocumentFile(createFile()), '')
  assert.match(await validateDocumentFile(createFile({ name: 'policy.html', type: 'text/html' })), /Choose a PDF, text, Word, Excel, or PowerPoint/)
  assert.match(await validateDocumentFile(createFile({ type: 'text/html' })), /does not match/)
  assert.match(await validateDocumentFile(createFile({ slice: () => ({ arrayBuffer: async () => new TextEncoder().encode('<html>').buffer }) })), /contents do not match/)
  assert.match(await validateDocumentFile(createFile({ size: 15 * 1024 * 1024 + 1 })), /15 MB or smaller/)
})

test('calendar event validation accepts valid events and rejects invalid time ranges', () => {
  const event = {
    title: 'Quarterly planning', description: 'Planning session', type: 'meeting',
    startAt: '2027-01-12T09:00:00.000Z', endAt: '2027-01-12T10:00:00.000Z',
    allDay: false, location: 'Office', reminderMinutes: 15,
  }
  assert.equal(validateClientForm('calendarEvent', event), '')
  assert.match(validateClientForm('calendarEvent', { ...event, endAt: event.startAt }), /date and time range/)
  assert.match(validateClientForm('calendarEvent', { ...event, reminderMinutes: 2 }), /reminder time/)
  assert.match(validateClientForm('calendarEvent', { ...event, type: 'unknown' }), /event type/)
})

test('client accepts valid signup fields and rejects weak or malformed values', () => {
  const signup = { name: 'Jordan Lee', phone: '+1 (555) 123-4567', email: 'jordan@example.com', dateOfBirth: '1995-06-12', password: 'correct horse', confirmPassword: 'correct horse' }
  assert.equal(validateClientForm('signup', signup), '')
  assert.match(validateClientForm('signup', { ...signup, name: 'J' }), /Full name/)
  assert.match(validateClientForm('signup', { ...signup, phone: '123' }), /Phone number/)
  assert.match(validateClientForm('signup', { ...signup, dateOfBirth: '2999-01-01' }), /date of birth/)
  assert.match(validateClientForm('signup', { ...signup, confirmPassword: 'different' }), /do not match/)
})

test('client rejects extra fields before sending sensitive profile changes', () => {
  assert.match(validateClientForm('profile', { name: 'Jordan Lee', email: 'jordan@example.com', role: 'admin' }), /Unexpected field/)
})

test('client profile form validates editable phone and date of birth fields', () => {
  const profile = { name: 'Jordan Lee', email: 'jordan@example.com', phone: '+1 (555) 123-4567', dateOfBirth: '1995-06-12' }
  assert.equal(validateClientForm('profile', profile), '')
  assert.match(validateClientForm('profile', { ...profile, phone: '123' }), /phone number/i)
  assert.match(validateClientForm('profile', { ...profile, dateOfBirth: '2999-01-01' }), /date of birth/)
})

test('client checks date ordering and invoice line items', () => {
  assert.match(validateClientForm('leave', { leaveType: 'annual', startDate: '2026-12-02', endDate: '2026-12-01', reason: 'Trip' }), /date range/)
  assert.match(validateClientForm('invoice', { customerName: 'Customer', customerEmail: '', status: 'draft', dueDate: '2026-12-01', notes: '', items: [] }), /invoice items/)
})

test('client validates GPS accuracy and requires reasons for location corrections', () => {
  const location = { latitude: 51.5, longitude: -0.12, accuracyMeters: 24, clientReportedAt: '2026-10-24T10:00:00.000Z' }
  assert.equal(validateClientForm('location', { location }), '')
  assert.match(validateClientForm('location', { location: { ...location, accuracyMeters: 50_001 } }), /accuracy/)
  assert.equal(validateClientForm('locationCorrection', { location, reason: 'The original reading was inaccurate.' }), '')
  assert.match(validateClientForm('locationCorrection', { location, reason: 'x' }), /Correction reason/)
  assert.equal(validateClientForm('locationReview', { decision: 'approve-correction', message: 'Confirmed with the employee.' }), '')
  assert.equal(validateClientForm('checkIn', { exceptionReason: 'Location permission is unavailable.' }), '')
  assert.match(validateClientForm('checkIn', { exceptionReason: 'x' }), /GPS exception reason/)
})

test('client chat validation rejects empty messages and malformed recipient identifiers', () => {
  assert.equal(validateClientForm('chatMessage', { body: 'Hello team' }), '')
  assert.match(validateClientForm('chatMessage', { body: '   ' }), /Message is required/)
  assert.match(validateClientForm('chatMessage', { body: 'x'.repeat(4001) }), /4000 characters/)
  assert.equal(validateClientForm('chatDirect', { userId: '64b000000000000000000001' }), '')
  assert.match(validateClientForm('chatDepartment', { departmentId: 'bad-id' }), /valid department/)
})

test('client CRM validation requires a name and an email address or phone', () => {
  const customer = { name: 'Jordan Lee', company: 'Orbit', email: 'jordan@example.com', phone: '', address: '', status: 'lead', source: '', notes: '' }
  assert.equal(validateClientForm('crmCustomer', customer), '')
  assert.match(validateClientForm('crmCustomer', { ...customer, email: '', phone: '' }), /email address or phone/i)
  assert.match(validateClientForm('crmCustomer', { ...customer, status: 'unknown' }), /valid customer status/i)
  assert.match(validateClientForm('crmCustomerImport', { customers: Array.from({ length: 101 }, () => customer) }), /1 and 100/i)
})

test('client revenue validation accepts transactions and rejects invalid money or ledger types', () => {
  const validTransaction = { transactionType: 'income', category: 'Client payment', amount: 1800.5, transactionDate: '2026-10-12', status: 'cleared', paymentMethod: 'bank-transfer', counterparty: 'Example Ltd', reference: 'INV-100', description: '' }
  assert.equal(validateClientForm('revenueTransaction', validTransaction), '')
  assert.match(validateClientForm('revenueTransaction', { ...validTransaction, transactionType: 'unknown' }), /choose income, expense, refund, or transfer/i)
  assert.match(validateClientForm('revenueTransaction', { ...validTransaction, amount: 10.001 }), /no more than two decimal places/i)
})

test('client admin user update validation accepts personal detail edits and rejects invalid values', () => {
  assert.equal(validateClientForm('adminUserUpdate', { name: 'Jordan Lee', email: 'jordan@example.com', phone: '+1 555 123 4567', dateOfBirth: '1990-01-10' }), '')
  assert.match(validateClientForm('adminUserUpdate', { name: 'J', email: 'bad-email' }), /name must|valid email/i)
  assert.match(validateClientForm('adminUserUpdate', { phone: '12' }), /phone number/i)
  assert.match(validateClientForm('adminUserUpdate', {}), /at least one user detail/i)
})

test('impersonation requires an explanatory support reason', () => {
  assert.equal(validateClientForm('impersonation', { reason: 'Reproduce reported access issue' }), '')
  assert.match(validateClientForm('impersonation', { reason: 'help' }), /10 characters/i)
})

test('chat message ticks advance from sent to delivered to seen', () => {
  const conversation = { participants: [{ id: 'sender' }, { id: 'recipient' }] }
  const message = { sender: { _id: 'sender' }, deliveredTo: [], readBy: ['sender'] }
  assert.equal(getChatMessageStatus(message, conversation, 'sender'), 'sent')
  assert.equal(getChatMessageStatus({ ...message, deliveredTo: ['recipient'] }, conversation, 'sender'), 'delivered')
  assert.equal(getChatMessageStatus({ ...message, deliveredTo: ['recipient'], readBy: ['sender', 'recipient'] }, conversation, 'sender'), 'seen')
  assert.equal(getChatMessageStatus(message, conversation, 'recipient'), '')
})

test('floating chat alerts only appear for incoming messages while outside chat', () => {
  assert.equal(shouldShowOffPageChatNotification('overview', 'colleague', 'current-user'), true)
  assert.equal(shouldShowOffPageChatNotification('chat', 'colleague', 'current-user'), false)
  assert.equal(shouldShowOffPageChatNotification('overview', 'current-user', 'current-user'), false)
})

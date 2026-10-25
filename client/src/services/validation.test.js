import test from 'node:test'
import assert from 'node:assert/strict'
import { validateClientForm, validateProfileImageFile } from './validation.js'
import { getChatMessageStatus, shouldShowOffPageChatNotification } from './chat.js'

test('client profile image checks allow supported images and reject unsafe or oversized files', () => {
  assert.equal(validateProfileImageFile({ type: 'image/webp', size: 120_000 }), '')
  assert.match(validateProfileImageFile({ type: 'image/svg+xml', size: 500 }), /JPEG, PNG, or WebP/)
  assert.match(validateProfileImageFile({ type: 'image/png', size: 1_572_865 }), /1.5 MB or smaller/)
  assert.match(validateProfileImageFile(null), /Choose a profile image/)
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

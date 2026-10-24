import test from 'node:test'
import assert from 'node:assert/strict'
import { validateClientForm } from './validation.js'

test('client accepts valid signup fields and rejects weak or malformed values', () => {
  assert.equal(validateClientForm('signup', { name: 'Jordan Lee', email: 'jordan@example.com', password: 'correct horse' }), '')
  assert.match(validateClientForm('signup', { name: 'J', email: 'bad', password: 'short' }), /Name/)
})

test('client rejects extra fields before sending sensitive profile changes', () => {
  assert.match(validateClientForm('profile', { name: 'Jordan Lee', email: 'jordan@example.com', role: 'admin' }), /Unexpected field/)
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

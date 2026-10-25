import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRequestBody } from '../utils/validation.js'

test('login validation accepts a valid email and password', () => {
  assert.deepEqual(validateRequestBody('login', { email: 'person@example.com', password: 'password' }), [])
})

test('signup validation rejects missing and malformed credentials', () => {
  const errors = validateRequestBody('signup', { name: 'A', phone: '123', email: 'bad-address', dateOfBirth: '2999-01-01', password: 'short' })
  assert.ok(errors.some((message) => message.includes('Name')))
  assert.ok(errors.some((message) => message.includes('Phone number')))
  assert.ok(errors.some((message) => message.includes('valid email')))
  assert.ok(errors.some((message) => message.includes('date of birth')))
  assert.ok(errors.some((message) => message.includes('8 characters')))
})

test('signup validation accepts all required personal details', () => {
  const errors = validateRequestBody('signup', { name: 'Jordan Lee', phone: '+15551234567', email: 'jordan@example.com', dateOfBirth: '1995-06-12', password: 'correct horse' })
  assert.deepEqual(errors, [])
})

test('validation rejects fields the endpoint does not accept', () => {
  const errors = validateRequestBody('profile', { name: 'Jordan Lee', email: 'jordan@example.com', role: 'admin' })
  assert.ok(errors.some((message) => message.includes('Unexpected field')))
})

test('profile validation accepts editable phone and birth date and rejects malformed values', () => {
  const validProfile = { name: 'Jordan Lee', email: 'jordan@example.com', phone: '+1 (555) 123-4567', dateOfBirth: '1995-06-12' }
  assert.deepEqual(validateRequestBody('profile', validProfile), [])
  assert.ok(validateRequestBody('profile', { ...validProfile, phone: '123' }).some((message) => /phone number/i.test(message)))
  assert.ok(validateRequestBody('profile', { ...validProfile, dateOfBirth: '2999-01-01' }).some((message) => message.includes('date of birth')))
})

test('invoice validation accepts a valid draft without a customer email', () => {
  const errors = validateRequestBody('invoice', {
    customerName: 'Orbit Customer', customerEmail: '', dueDate: '2026-11-01', notes: '', status: 'draft',
    items: [{ description: 'Consulting', quantity: 2, unitPrice: 50 }],
  })
  assert.deepEqual(errors, [])
})

test('bulk import validation enforces its row cap and object shape', () => {
  assert.ok(validateRequestBody('userImport', { users: Array.from({ length: 101 }, () => ({})) }).length)
  assert.ok(validateRequestBody('userImport', { users: ['not a row'] }).length)
})

test('attendance GPS validation bounds coordinates and records a separate device timestamp', () => {
  const location = { latitude: 51.5, longitude: -0.12, accuracyMeters: 24, clientReportedAt: '2026-10-24T10:00:00.000Z' }
  assert.deepEqual(validateRequestBody('location', { location }), [])
  assert.ok(validateRequestBody('location', { location: { ...location, accuracyMeters: 50_001 } }).length)
  assert.ok(validateRequestBody('location', { location: { ...location, latitude: 91 } }).length)
})

test('attendance correction and manager review require a reason and review note', () => {
  const location = { latitude: 51.5, longitude: -0.12, accuracyMeters: 24 }
  assert.deepEqual(validateRequestBody('locationCorrection', { location, reason: 'Device reported the wrong location.' }), [])
  assert.ok(validateRequestBody('locationCorrection', { location, reason: 'x' }).length)
  assert.deepEqual(validateRequestBody('locationReview', { decision: 'approve-correction', message: 'Verified with the employee.' }), [])
  assert.ok(validateRequestBody('locationReview', { decision: 'delete-record', message: 'Reviewed.' }).length)
})

test('GPS failure can be recorded with an explanation and a pending human review', () => {
  assert.deepEqual(validateRequestBody('checkIn', { exceptionReason: 'Location permission is unavailable on my device.' }), [])
  assert.ok(validateRequestBody('checkIn', { exceptionReason: 'x' }).length)
  assert.deepEqual(validateRequestBody('checkIn', { location: { latitude: 10, longitude: 20, accuracyMeters: 25 } }), [])
})

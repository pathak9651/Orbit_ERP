import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCustomer } from '../controllers/customerController.js'

test('CRM customer validation normalizes valid contact details and default status', () => {
  const result = validateCustomer({ name: '  Jordan Lee ', email: ' JORDAN@example.com ' })
  assert.deepEqual(result.issues, [])
  assert.equal(result.customer.name, 'Jordan Lee')
  assert.equal(result.customer.email, 'jordan@example.com')
  assert.equal(result.customer.status, 'lead')
})

test('CRM customer validation requires a name and at least one contact method', () => {
  const result = validateCustomer({ name: 'A' })
  assert.match(result.issues.join(' '), /name must be/i)
  assert.match(result.issues.join(' '), /email address or phone/i)
})

test('CRM customer validation rejects malformed email, unsupported status, and oversized notes', () => {
  const result = validateCustomer({ name: 'Jordan Lee', email: 'bad-email', status: 'unknown', notes: 'x'.repeat(2001) })
  assert.match(result.issues.join(' '), /valid email/i)
  assert.match(result.issues.join(' '), /valid customer status/i)
  assert.match(result.issues.join(' '), /allowed length/i)
})

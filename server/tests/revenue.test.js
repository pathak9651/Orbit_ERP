import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRevenueTransaction } from '../controllers/revenueController.js'

const validTransaction = {
  transactionType: 'income', category: 'Service income', amount: 12500.5,
  transactionDate: '2026-10-12', status: 'cleared', paymentMethod: 'upi',
  counterparty: 'Northwind Ltd', reference: 'INV-20261012-ABC12345', description: 'Consulting work',
}

test('revenue transaction validation normalizes allowed ledger details', () => {
  const result = validateRevenueTransaction({ ...validTransaction, category: ' Service income ', transactionType: 'INCOME' })
  assert.deepEqual(result.issues, [])
  assert.equal(result.transaction.category, 'Service income')
  assert.equal(result.transaction.transactionType, 'income')
})

test('revenue transaction validation rejects unsupported types, invalid amounts, dates, and methods', () => {
  const result = validateRevenueTransaction({ ...validTransaction, transactionType: 'salary', amount: -5, transactionDate: '2026-02-30', paymentMethod: 'crypto' })
  assert.match(result.issues.join(' '), /choose income, expense, refund, or transfer/i)
  assert.match(result.issues.join(' '), /amount must be a positive/i)
  assert.match(result.issues.join(' '), /valid transaction date/i)
  assert.match(result.issues.join(' '), /supported payment method/i)
})

test('pending and voided entries validate but remain distinguishable from cleared income', () => {
  const result = validateRevenueTransaction({ ...validTransaction, transactionType: 'expense', status: 'pending' })
  assert.deepEqual(result.issues, [])
  assert.equal(result.transaction.status, 'pending')
  assert.equal(result.transaction.transactionType, 'expense')
})

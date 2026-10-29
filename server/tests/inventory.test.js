import test from 'node:test'
import assert from 'node:assert/strict'
import { validateInventoryItem } from '../controllers/inventoryController.js'

const validItem = {
  name: 'Printer paper', category: 'Stationery', sku: 'paper-a4',
  quantity: 12, reorderLevel: 4, unit: 'reams', location: 'Supply room',
  supplier: 'Office Supply Co', description: 'A4 copy paper',
}

test('inventory validation trims labels, normalizes SKU, and accepts zero quantity', () => {
  const result = validateInventoryItem({ ...validItem, name: ' Printer paper ', sku: ' paper-a4 ', quantity: 0 })
  assert.deepEqual(result.issues, [])
  assert.equal(result.item.name, 'Printer paper')
  assert.equal(result.item.sku, 'PAPER-A4')
  assert.equal(result.item.quantity, 0)
})

test('inventory validation rejects invalid thresholds and oversized fields', () => {
  const result = validateInventoryItem({ ...validItem, quantity: -1, reorderLevel: 1.5, location: 'x'.repeat(121) })
  assert.match(result.issues.join(' '), /quantity must be a whole number/i)
  assert.match(result.issues.join(' '), /reorder level must be a whole number/i)
  assert.match(result.issues.join(' '), /exceeds the allowed length/i)
})

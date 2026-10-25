import test from 'node:test'
import assert from 'node:assert/strict'
import { escapeCsvCell, serializeCsvRow } from '../utils/csv.js'

test('CSV serialization quotes and escapes commas, quotes, and line breaks', () => {
  assert.equal(serializeCsvRow(['A, B', 'say "hello"', 'two\nlines']), '"A, B","say ""hello""","two\nlines"\r\n')
})

test('CSV cells neutralize spreadsheet formulas after leading whitespace', () => {
  for (const formula of ['=1+1', '+SUM(A1:A2)', '-2+3', '@SUM(A1)', '  =cmd']) {
    assert.equal(escapeCsvCell(formula).startsWith('"\''), true)
  }
  assert.equal(escapeCsvCell('ordinary text'), '"ordinary text"')
})

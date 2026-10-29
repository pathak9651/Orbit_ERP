import test from 'node:test'
import assert from 'node:assert/strict'
import { getWorkplaceDateKey } from '../controllers/homeController.js'

test('home attendance date follows the configured workplace timezone at UTC day boundaries', () => {
  const instant = new Date('2026-10-28T19:30:00.000Z')
  assert.equal(getWorkplaceDateKey(instant, 'UTC'), '2026-10-28')
  assert.equal(getWorkplaceDateKey(instant, 'Asia/Kolkata'), '2026-10-29')
})

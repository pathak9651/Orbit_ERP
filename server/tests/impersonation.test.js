import test from 'node:test'
import assert from 'node:assert/strict'
import { createAccessToken, verifyAccessToken } from '../services/auth.js'

test('impersonation access tokens are short lived and include administrator provenance', () => {
  process.env.JWT_SECRET ||= 'test-secret-that-is-at-least-thirty-two-characters-long'
  const token = createAccessToken(
    { id: '64b000000000000000000001', role: 'employee', tokenVersion: 3 },
    { actorId: '64b000000000000000000002', actorTokenVersion: 7, sessionId: 'one-time-session-id' },
  )
  const payload = verifyAccessToken(token)
  assert.equal(payload.sub, '64b000000000000000000001')
  assert.equal(payload.role, 'employee')
  assert.deepEqual(payload.impersonation, { actorId: '64b000000000000000000002', actorTokenVersion: 7, sessionId: 'one-time-session-id' })
  assert.ok(payload.exp - payload.iat <= 15 * 60)
})

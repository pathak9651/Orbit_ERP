import test from 'node:test'
import assert from 'node:assert/strict'
import AuditEvent from '../models/auditEvent.js'
import User from '../models/user.js'
import { hashPassword } from '../services/auth.js'
import { signIn } from '../controllers/authController.js'

/** Calls the controller with an Express-like response and returns its status and body. */
async function attemptLogin(email, password) {
  const result = { status: 200, headers: {}, body: null }
  const response = {
    set(name, value) { result.headers[name] = value; return this },
    status(status) { result.status = status; return this },
    json(body) { result.body = body; return this },
    cookie() { return this },
  }
  await signIn({ body: { email, password }, ip: '127.0.0.1', get: () => '' }, response, (error) => { throw error })
  return result
}

test('three incorrect passwords start a ten-minute account login cooldown', async (context) => {
  const originalJwtSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters-long'
  context.after(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalJwtSecret
  })

  const loginState = { failedLoginAttempts: 0, loginCooldownUntil: null }
  const user = {
    _id: '64b000000000000000000001',
    id: '64b000000000000000000001',
    email: 'person@example.com',
    name: 'Test Person',
    role: 'employee',
    password: await hashPassword('correct-password'),
    isVerified: true,
    ...loginState,
  }

  context.mock.method(User, 'findOne', () => ({
    select() { return this },
    async populate() {
      user.failedLoginAttempts = loginState.failedLoginAttempts
      user.loginCooldownUntil = loginState.loginCooldownUntil
      return user
    },
  }))
  context.mock.method(User, 'findOneAndUpdate', async (_filter, update) => {
    loginState.failedLoginAttempts += update.$inc.failedLoginAttempts
    return { failedLoginAttempts: loginState.failedLoginAttempts }
  })
  context.mock.method(User, 'updateOne', async (_filter, update) => {
    if (update.$set?.failedLoginAttempts !== undefined) loginState.failedLoginAttempts = update.$set.failedLoginAttempts
    if (update.$set?.loginCooldownUntil) loginState.loginCooldownUntil = update.$set.loginCooldownUntil
    if (update.$unset?.loginCooldownUntil) loginState.loginCooldownUntil = null
    return { acknowledged: true }
  })
  context.mock.method(AuditEvent, 'create', async () => ({}))

  const first = await attemptLogin('person@example.com', 'wrong-password')
  const second = await attemptLogin('person@example.com', 'wrong-password')
  const third = await attemptLogin('person@example.com', 'wrong-password')
  assert.equal(first.status, 401)
  assert.equal(second.status, 401)
  assert.equal(third.status, 401)
  assert.equal(loginState.failedLoginAttempts, 3)
  assert.ok(loginState.loginCooldownUntil.getTime() - Date.now() <= 10 * 60 * 1000)
  assert.ok(loginState.loginCooldownUntil.getTime() - Date.now() > 9 * 60 * 1000)

  const blocked = await attemptLogin('person@example.com', 'correct-password')
  assert.equal(blocked.status, 429)
  assert.ok(Number(blocked.headers['Retry-After']) > 0)
  assert.equal(loginState.failedLoginAttempts, 3)
})


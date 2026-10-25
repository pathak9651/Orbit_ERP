import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import app from '../app.js'
import { closeRateLimitStore, connectRateLimitStore } from '../services/rateLimiter.js'

let server
let baseUrl

before(async () => {
  if (process.env.REDIS_URL) await connectRateLimitStore()
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (process.env.REDIS_URL) await closeRateLimitStore()
})

test('signup rejects malformed fields before account storage is reached', async () => {
  const response = await fetch(`${baseUrl}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', phone: '123', email: 'not-an-email', dateOfBirth: '2999-01-01', password: 'small' }),
  })
  const result = await response.json()
  assert.equal(response.status, 400)
  assert.ok(result.errors.length >= 5)
})

test('login rejects unexpected fields before authentication logic runs', async () => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'person@example.com', password: 'correct-password', role: 'admin' }),
  })
  const result = await response.json()
  assert.equal(response.status, 400)
  assert.match(result.message, /unexpected body field/i)
})

test('signup rejects a wrong field type before account storage is reached', async () => {
  const response = await fetch(`${baseUrl}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: { $ne: '' }, phone: '+15551234567', email: 'person@example.com', dateOfBirth: '1995-06-12', password: 'correct-password' }),
  })
  assert.equal(response.status, 400)
})

test('malformed JSON receives a client error instead of a server error', async () => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"email":',
  })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { message: 'Request body must contain valid JSON.' })
})

test('state-changing browser API requests reject an untrusted Origin', async () => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'person@example.com', password: 'valid-password' }),
  })
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { message: 'Untrusted request origin.' })
})

test('cookie-authenticated state changes reject a missing Origin header', async () => {
  const response = await fetch(`${baseUrl}/api/logout`, {
    method: 'POST',
    headers: { Cookie: 'orbit_token=present' },
  })
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { message: 'A trusted request origin is required.' })
})

test('safe API reads do not use the state-changing Origin guard', async () => {
  const response = await fetch(`${baseUrl}/api/me`, {
    headers: { Origin: 'https://attacker.example' },
  })
  assert.equal(response.status, 401)
})

test('profile image uploads require an authenticated session', async () => {
  const response = await fetch(`${baseUrl}/api/profile/image`, {
    method: 'PUT',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'image/png' },
    body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  })
  assert.equal(response.status, 401)
})

test('company overview is available only to an authenticated administrator', async () => {
  const response = await fetch(`${baseUrl}/api/admin/overview`)
  assert.equal(response.status, 401)
})

test('chat endpoints require an authenticated account before reading chat data', async () => {
  for (const path of ['/api/chat/conversations', '/api/chat/contacts', '/api/chat/departments']) {
    const response = await fetch(`${baseUrl}${path}`)
    assert.equal(response.status, 401)
  }
  const readResponse = await fetch(`${baseUrl}/api/chat/conversations/64b000000000000000000001/read`, { method: 'PATCH', headers: { Origin: 'http://localhost:5173' } })
  assert.equal(readResponse.status, 401)
  const exportResponse = await fetch(`${baseUrl}/api/chat/conversations/64b000000000000000000001/export.csv`)
  assert.equal(exportResponse.status, 401)
})

test('login endpoint throttles repeated invalid attempts by client address', async () => {
  let lastResponse
  for (let attempt = 0; attempt < 11; attempt += 1) {
    lastResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid', password: '' }),
    })
  }
  assert.equal(lastResponse.status, 429)
  assert.equal(lastResponse.headers.get('ratelimit-limit'), '10')
  assert.ok(Number(lastResponse.headers.get('retry-after')) > 0)
})

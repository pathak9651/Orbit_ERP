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
    body: JSON.stringify({ name: 'A', email: 'not-an-email', password: 'small' }),
  })
  const result = await response.json()
  assert.equal(response.status, 400)
  assert.ok(result.errors.length >= 3)
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

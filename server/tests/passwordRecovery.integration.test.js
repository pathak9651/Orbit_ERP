import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import app from '../app.js'

let server
let baseUrl

before(async () => {
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('forgot-password validates addresses before querying account storage', async () => {
  const response = await fetch(`${baseUrl}/api/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify({ email: 'not-an-email' }) })
  assert.equal(response.status, 400)
})

test('reset-password rejects weak passwords before consuming reset tokens', async () => {
  const response = await fetch(`${baseUrl}/api/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify({ token: 'random-reset-value', newPassword: 'weak' }) })
  const result = await response.json()
  assert.equal(response.status, 400)
  assert.match(result.message, /at least 8 characters/i)
})


import test from 'node:test'
import assert from 'node:assert/strict'
import app from '../app.js'

let server
let baseUrl

test('Helmet sends security headers and the app-specific CSP', async (context) => {
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
  context.after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))

  const response = await fetch(`${baseUrl}/api/me`)
  const csp = response.headers.get('content-security-policy') || ''

  assert.equal(response.status, 401)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN')
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /frame-src https:\/\/maps\.google\.com https:\/\/www\.google\.com/)
  assert.match(csp, /script-src 'self'/)
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/)
  if (process.env.NODE_ENV === 'production') assert.match(csp, /upgrade-insecure-requests/)
  else assert.doesNotMatch(csp, /upgrade-insecure-requests/)
  assert.equal(response.headers.get('strict-transport-security'), null)
})

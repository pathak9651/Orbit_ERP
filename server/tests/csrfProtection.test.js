import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrowserOriginGuard } from '../middlewares/security.js'

function runGuard({ method = 'POST', origin, cookies = {}, authorization } = {}) {
  const guard = createBrowserOriginGuard(['https://erp.example.com'])
  const result = {}
  const req = {
    method,
    cookies,
    get(name) {
      if (name.toLowerCase() === 'origin') return origin
      if (name.toLowerCase() === 'authorization') return authorization
      return undefined
    },
  }
  const res = {
    status(code) { result.status = code; return this },
    json(body) { result.body = body; return this },
  }

  guard(req, res, () => { result.next = true })
  return result
}

test('safe HTTP methods do not require an Origin header', () => {
  assert.equal(runGuard({ method: 'GET' }).next, true)
  assert.equal(runGuard({ method: 'HEAD' }).next, true)
  assert.equal(runGuard({ method: 'OPTIONS' }).next, true)
})

test('state-changing requests accept only an exact allowlisted origin', () => {
  assert.equal(runGuard({ origin: 'https://erp.example.com' }).next, true)
  assert.equal(runGuard({ origin: 'https://erp.example.com.attacker.test' }).status, 403)
  assert.equal(runGuard({ origin: 'https://attacker.test' }).status, 403)
})

test('cookie-authenticated state changes reject a missing Origin header', () => {
  assert.equal(runGuard({ cookies: { orbit_token: 'signed-session-token' } }).status, 403)
})

test('bearer-only API clients may omit Origin because they do not use ambient cookies', () => {
  assert.equal(runGuard({ authorization: 'Bearer signed-api-token' }).next, true)
})

test('a non-browser request without a session cookie may omit Origin', () => {
  assert.equal(runGuard().next, true)
})

test('paths appended to an origin are not accepted as an exact origin', () => {
  assert.equal(runGuard({ origin: 'https://erp.example.com/path' }).status, 403)
})

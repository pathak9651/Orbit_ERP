import test from 'node:test'
import assert from 'node:assert/strict'
import { getSessionRejectionReason } from '../services/auth.js'

test('a token remains valid while the account token version matches', () => {
  assert.equal(getSessionRejectionReason({ tokenVersion: 2 }, { tokenVersion: 2, isVerified: true }), null)
})

test('logout revokes existing tokens by advancing the account token version', () => {
  const oldTokenPayload = { tokenVersion: 0 }
  const accountAfterLogout = { tokenVersion: 1, isVerified: true }
  assert.equal(getSessionRejectionReason(oldTokenPayload, accountAfterLogout), 'token-revoked')
})

test('password changes revoke existing tokens while the replacement version stays valid', () => {
  const tokenBeforePasswordChange = { tokenVersion: 4 }
  const accountAfterPasswordChange = { tokenVersion: 5, isVerified: true }
  const replacementToken = { tokenVersion: 5 }
  assert.equal(getSessionRejectionReason(tokenBeforePasswordChange, accountAfterPasswordChange), 'token-revoked')
  assert.equal(getSessionRejectionReason(replacementToken, accountAfterPasswordChange), null)
})

test('suspended accounts reject their existing token', () => {
  assert.equal(getSessionRejectionReason({ tokenVersion: 0 }, { tokenVersion: 1, isVerified: false }), 'account-unverified')
})

test('role and department changes reject tokens issued before the change', () => {
  assert.equal(getSessionRejectionReason({ tokenVersion: 7 }, { tokenVersion: 8, isVerified: true }), 'token-revoked')
})

test('pre-version JWTs remain compatible until the account is explicitly revoked', () => {
  assert.equal(getSessionRejectionReason({}, { tokenVersion: 0, isVerified: true }), null)
  assert.equal(getSessionRejectionReason({}, { tokenVersion: 1, isVerified: true }), 'token-revoked')
})

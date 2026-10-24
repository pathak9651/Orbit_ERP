import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyUserPassword } from '../services/auth.js'

test('password hashing uses bcrypt and verifies the matching password', async () => {
  const passwordHash = await hashPassword('A long test passphrase 123!')
  assert.match(passwordHash, /^\$2[aby]\$\d{2}\$/)
  assert.equal(await verifyUserPassword({ password: passwordHash }, 'A long test passphrase 123!'), true)
  assert.equal(await verifyUserPassword({ password: passwordHash }, 'a different password'), false)
})

test('plaintext password values are rejected and never upgraded during login', async () => {
  let saveCalled = false
  const legacyUser = {
    password: 'LegacyPlaintext-123',
    async save() { saveCalled = true },
  }

  assert.equal(await verifyUserPassword(legacyUser, 'LegacyPlaintext-123'), false)
  assert.equal(legacyUser.password, 'LegacyPlaintext-123')
  assert.equal(saveCalled, false)
})

test('missing or malformed stored password hashes are rejected', async () => {
  assert.equal(await verifyUserPassword({}, 'any password'), false)
  assert.equal(await verifyUserPassword({ password: '$2b$12$not-a-complete-hash' }, 'any password'), false)
})

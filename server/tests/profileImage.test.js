import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PROFILE_IMAGE_BYTES, validateProfileImageUpload } from '../utils/validation.js'

test('profile image validation accepts JPEG, PNG, and WebP signatures', () => {
  assert.equal(validateProfileImageUpload(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'), '')
  assert.equal(validateProfileImageUpload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), '')
  assert.equal(validateProfileImageUpload(Buffer.from('RIFF0000WEBP'), 'image/webp'), '')
})

test('profile image validation rejects mismatched, unsupported, empty, and oversized uploads', () => {
  assert.match(validateProfileImageUpload(Buffer.from('<svg/>'), 'image/svg+xml'), /valid JPEG, PNG, or WebP/)
  assert.match(validateProfileImageUpload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/jpeg'), /valid JPEG, PNG, or WebP/)
  assert.match(validateProfileImageUpload(Buffer.alloc(0), 'image/png'), /Choose a profile image/)
  assert.match(validateProfileImageUpload(Buffer.alloc(MAX_PROFILE_IMAGE_BYTES + 1), 'image/png'), /1.5 MB or smaller/)
})

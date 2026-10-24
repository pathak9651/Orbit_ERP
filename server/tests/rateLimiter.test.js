import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { MemoryStore } from 'express-rate-limit'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createRateLimiter, normalizeClientAddress, connectRateLimitStore, closeRateLimitStore } from '../services/rateLimiter.js'

async function listenWithLimiter(limiter) {
  const app = express()
  app.get('/', limiter, (req, res) => res.sendStatus(204))
  const server = createServer(app).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  return { server, url: `http://127.0.0.1:${address.port}/` }
}

test('rate limiter allows the configured request count then responds with 429 and retry headers', async () => {
  const limiter = createRateLimiter({ name: `unit-${Date.now()}`, windowMs: 60_000, maxRequests: 2, store: new MemoryStore() })
  const { server, url } = await listenWithLimiter(limiter)
  try {
    assert.equal((await fetch(url)).status, 204)
    assert.equal((await fetch(url)).status, 204)
    const blocked = await fetch(url)
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.headers.get('retry-after')) > 0)
  } finally {
    server.close()
    await once(server, 'close')
  }
})

test('policies with separate names maintain independent counters', async () => {
  const clientKey = () => 'same-client'
  const first = await listenWithLimiter(createRateLimiter({ name: `first-${Date.now()}`, windowMs: 60_000, maxRequests: 1, keyGenerator: clientKey, store: new MemoryStore() }))
  const second = await listenWithLimiter(createRateLimiter({ name: `second-${Date.now()}`, windowMs: 60_000, maxRequests: 1, keyGenerator: clientKey, store: new MemoryStore() }))
  try {
    assert.equal((await fetch(first.url)).status, 204)
    assert.equal((await fetch(second.url)).status, 204)
  } finally {
    first.server.close()
    second.server.close()
    await Promise.all([once(first.server, 'close'), once(second.server, 'close')])
  }
})

test('client addresses group IPv6 privacy addresses and normalize IPv4-mapped addresses', () => {
  assert.equal(normalizeClientAddress('2001:db8:1:2::1'), normalizeClientAddress('2001:db8:1:2::abcd'))
  assert.equal(normalizeClientAddress('::ffff:192.0.2.8'), normalizeClientAddress('192.0.2.8'))
})

test('two independent app instances share Redis counters across a simulated restart', { skip: !process.env.REDIS_URL }, async () => {
  await connectRateLimitStore()
  const policyName = `integration-${Date.now()}`
  const makeLimiter = () => createRateLimiter({ name: policyName, windowMs: 60_000, maxRequests: 1, keyGenerator: () => 'shared-test-account' })
  const instanceOne = await listenWithLimiter(makeLimiter())
  const instanceTwo = await listenWithLimiter(makeLimiter())
  try {
    assert.equal((await fetch(instanceOne.url)).status, 204)
    // A newly created limiter models a second server process starting with no local counter state.
    assert.equal((await fetch(instanceTwo.url)).status, 429)
  } finally {
    instanceOne.server.close()
    instanceTwo.server.close()
    await Promise.all([once(instanceOne.server, 'close'), once(instanceTwo.server, 'close')])
    await closeRateLimitStore()
  }
})

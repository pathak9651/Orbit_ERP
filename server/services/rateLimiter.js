import { isIP } from 'node:net'
import { createHash } from 'node:crypto'
import { createClient } from 'redis'
import { RedisStore } from 'rate-limit-redis'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'

let redisClient
const redisConfigured = Boolean(process.env.REDIS_URL)

/** Groups IPv6 privacy addresses by /64 and maps IPv4-mapped IPv6 values to their IPv4 address. */
export function normalizeClientAddress(value) {
  const address = String(value || '').split('%')[0].toLowerCase()
  if (isIP(address) === 4) return `ipv4:${address}`
  if (isIP(address) !== 6) return address || 'unknown'

  const halves = address.split('::')
  const expandPart = (part) => part ? part.split(':') : []
  const left = expandPart(halves[0])
  const right = expandPart(halves[1])
  const lastPart = right.length ? right : left
  if (lastPart.at(-1)?.includes('.')) {
    const octets = lastPart.pop().split('.').map(Number)
    lastPart.push(((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16))
  }
  const groups = halves.length === 2
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left
  const normalizedGroups = groups.map((group) => Number.parseInt(group || '0', 16))

  if (normalizedGroups.length === 8 && normalizedGroups.slice(0, 5).every((group) => group === 0) && normalizedGroups[5] === 0xffff) {
    const first = normalizedGroups[6]
    const second = normalizedGroups[7]
    return `ipv4:${first >> 8}.${first & 255}.${second >> 8}.${second & 255}`
  }
  return `ipv6:${normalizedGroups.slice(0, 4).map((group) => group.toString(16)).join(':')}/64`
}

/** Creates one policy with a uniquely namespaced shared Redis counter. */
export function createRateLimiter({ name, windowMs, maxRequests, keyGenerator = (req) => ipKeyGenerator(req.ip), message = 'Too many requests. Please wait before trying again.', store }) {
  if (!name || !Number.isFinite(windowMs) || windowMs < 1 || !Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new Error('Rate limiters need a name, positive window, and positive request limit.')
  }
  const options = {
    windowMs,
    limit: maxRequests,
    keyGenerator,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    passOnStoreError: false,
    handler: (req, res) => res.status(429).json({ message }),
  }

  if (store) {
    options.store = store
  } else if (redisConfigured) {
    options.store = new RedisStore({
      prefix: `orbit-erp:${name}:`,
      sendCommand: (...args) => {
        if (!redisClient?.isReady) throw new Error('The shared rate-limit store is unavailable.')
        return redisClient.sendCommand(args)
      },
    })
  }
  return rateLimit(options)
}

const FIFTEEN_MINUTES = 15 * 60 * 1000
const ONE_HOUR = 60 * 60 * 1000

/** Protects the API by client IP; the user-level policy is applied after authentication on protected routes. */
export const apiRateLimiter = createRateLimiter({ name: 'api-ip', windowMs: FIFTEEN_MINUTES, maxRequests: 5000 })
/** Slows credential guessing from one source network. */
export const loginRateLimiter = createRateLimiter({ name: 'login-ip', windowMs: FIFTEEN_MINUTES, maxRequests: 10 })
/** Independently throttles repeated guesses against one normalized email address. */
export const loginAccountRateLimiter = createRateLimiter({ name: 'login-account', windowMs: FIFTEEN_MINUTES, maxRequests: 8, keyGenerator: (req) => hashIdentifier(req.body?.email) })
/** Prevents automated account creation bursts. */
export const signupRateLimiter = createRateLimiter({ name: 'signup', windowMs: ONE_HOUR, maxRequests: 5 })
/** Limits repeated password-change attempts for an authenticated client. */
export const passwordChangeRateLimiter = createRateLimiter({ name: 'password-change', windowMs: FIFTEEN_MINUTES, maxRequests: 5, keyGenerator: (req) => String(req.user?._id || ipKeyGenerator(req.ip)) })
/** Limits reset-email requests by source network to reduce inbox abuse. */
export const passwordResetRequestRateLimiter = createRateLimiter({ name: 'password-reset-request', windowMs: FIFTEEN_MINUTES, maxRequests: 5 })
/** Limits guesses against password-reset links. */
export const passwordResetSubmitRateLimiter = createRateLimiter({ name: 'password-reset-submit', windowMs: FIFTEEN_MINUTES, maxRequests: 10 })
/** Applies an authenticated-user quota across ordinary protected API endpoints. */
export const authenticatedApiRateLimiter = createRateLimiter({ name: 'api-user', windowMs: FIFTEEN_MINUTES, maxRequests: 1500, keyGenerator: (req) => String(req.user?._id || ipKeyGenerator(req.ip)) })
/** Slows repetitive chat posting while allowing normal work conversations. */
export const chatMessageRateLimiter = createRateLimiter({ name: 'chat-message', windowMs: 60 * 1000, maxRequests: 60, keyGenerator: (req) => String(req.user?._id || ipKeyGenerator(req.ip)), message: 'You are sending messages too quickly. Please wait a moment.' })
/** Caps email delivery requests per sender account. */
export const emailRateLimiter = createRateLimiter({ name: 'email-account', windowMs: ONE_HOUR, maxRequests: 20, keyGenerator: (req) => String(req.user?._id || ipKeyGenerator(req.ip)) })
/** Enforces a shared organization-wide SMTP quota across mail and invoice delivery routes. */
export const organizationEmailRateLimiter = createRateLimiter({ name: 'email-organization', windowMs: ONE_HOUR, maxRequests: 300, keyGenerator: () => 'organization' })
/** Caps imported spreadsheet batches per administrator account. */
export const importRateLimiter = createRateLimiter({ name: 'user-import', windowMs: ONE_HOUR, maxRequests: 10, keyGenerator: (req) => String(req.user?._id || ipKeyGenerator(req.ip)) })
/** Limits repeat attempts to create or send invoices per account. */
export const invoiceEmailRateLimiter = createRateLimiter({ name: 'invoice-email', windowMs: ONE_HOUR, maxRequests: 10, keyGenerator: (req) => String(req.user?._id || ipKeyGenerator(req.ip)) })
/** Spreads costly full-organization exports apart per administrator, which also prevents concurrent bursts. */
export const exportRateLimiter = createRateLimiter({ name: 'data-export', windowMs: FIFTEEN_MINUTES, maxRequests: 1, keyGenerator: (req) => String(req.user?._id || ipKeyGenerator(req.ip)), message: 'An export was recently requested. Try again later.' })

/** Keeps login identifiers out of Redis keys while giving equivalent emails the same quota. */
function hashIdentifier(value) {
  const normalizedEmail = typeof value === 'string' ? value.trim().toLowerCase() : 'missing-email'
  return createHash('sha256').update(normalizedEmail).digest('hex')
}

/** Connects the shared Redis counter store before accepting requests. */
export async function connectRateLimitStore() {
  if (!redisConfigured) {
    if (process.env.NODE_ENV === 'production') throw new Error('REDIS_URL is required in production for shared rate limits.')
    console.warn('REDIS_URL is not set; rate limits are process-local in this non-production environment.')
    return
  }
  redisClient = createClient({ url: process.env.REDIS_URL })
  redisClient.on('error', (error) => console.error('Rate-limit Redis error:', error.message))
  await redisClient.connect()
  await redisClient.ping()
}

/** Closes the shared Redis connection during graceful server shutdown. */
export async function closeRateLimitStore() {
  if (redisClient?.isOpen) await redisClient.quit()
}

import { TOKEN_COOKIE } from '../services/auth.js'

const DEVELOPMENT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Normalizes an exact HTTP origin and rejects URLs that include paths or other URL parts. */
function normalizeOrigin(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    if (url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

/** Creates a guard for unsafe browser requests using only an explicit origin allowlist. */
export function createBrowserOriginGuard(originValues) {
  const allowedOrigins = new Set(originValues.map(normalizeOrigin).filter(Boolean))

  return function verifyBrowserOrigin(req, res, next) {
    if (SAFE_METHODS.has(req.method.toUpperCase())) return next()

    const origin = req.get('origin')
    const hasAuthCookie = Boolean(req.cookies?.[TOKEN_COOKIE])
    const hasBearerToken = req.get('authorization')?.startsWith('Bearer ')

    if (origin) {
      if (!allowedOrigins.has(origin)) {
        return res.status(403).json({ message: 'Untrusted request origin.' })
      }
      return next()
    }

    // A browser cookie is sent automatically, so require a trustworthy Origin on mutations.
    if (hasAuthCookie || (!hasBearerToken && req.cookies && Object.keys(req.cookies).length > 0)) {
      return res.status(403).json({ message: 'A trusted request origin is required.' })
    }

    // Clients authenticated with a bearer header do not rely on ambient browser cookies.
    return next()
  }
}

/** Reads exact trusted origins from configuration; local Vite origins are development defaults. */
function configuredOrigins() {
  if (process.env.CLIENT_ORIGIN) {
    return process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  }
  return process.env.NODE_ENV === 'production' ? [] : DEVELOPMENT_ORIGINS
}

export const verifyBrowserOrigin = createBrowserOriginGuard(configuredOrigins())

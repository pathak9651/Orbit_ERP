import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Shared cookie key ensures sign-in, authentication, and sign-out use the same session token.
export const TOKEN_COOKIE = 'orbit_token';
const TOKEN_LIFETIME = '7d';

/** Reads the signing secret only when token work is needed and rejects weak configuration. */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
  }
  return secret;
}

/** Hashes a plain password before storing it in the account collection. */
export function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

/** Compares a candidate password with a previously stored bcrypt hash. */
export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

/** Verifies passwords only against well-formed bcrypt hashes; plaintext values are rejected. */
export async function verifyUserPassword(user, password) {
  const storedPassword = user?.password;
  const bcryptHashPattern = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
  if (typeof storedPassword !== 'string' || !bcryptHashPattern.test(storedPassword)) return false;
  return verifyPassword(password, storedPassword);
}

/** Signs the token payload used to identify the authenticated account. */
export function createAccessToken(user) {
  return jwt.sign({ role: user.role, tokenVersion: user.tokenVersion ?? 0 }, getJwtSecret(), {
    subject: user.id,
    expiresIn: TOKEN_LIFETIME,
    algorithm: 'HS256',
  });
}

/** Validates a signed JWT and returns its trusted identity claims. */
export function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
}

/** Accepts pre-version tokens as version zero during rollout and rejects revoked tokens. */
export function isTokenVersionCurrent(payload, currentVersion) {
  const tokenVersion = payload?.tokenVersion ?? 0;
  const storedVersion = currentVersion ?? 0;
  return Number.isInteger(tokenVersion) && Number.isInteger(storedVersion) && tokenVersion === storedVersion;
}

/** Explains why a verified JWT no longer represents an active account session. */
export function getSessionRejectionReason(payload, user) {
  if (!user) return 'account-missing';
  if (user.isVerified === false) return 'account-unverified';
  if (!isTokenVersionCurrent(payload, user.tokenVersion)) return 'token-revoked';
  return null;
}

/** Centralizes cookie security and expiry options for set and clear operations. */
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

/** Stores the JWT in an HTTP-only cookie so browser scripts cannot read it. */
export function setAuthCookie(res, token) {
  res.cookie(TOKEN_COOKIE, token, cookieOptions());
}

/** Removes the session cookie using the same path and security options it was set with. */
export function clearAuthCookie(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(TOKEN_COOKIE, options);
}

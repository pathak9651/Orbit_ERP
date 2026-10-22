import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';

export const TOKEN_COOKIE = 'orbit_token';
const TOKEN_LIFETIME = '7d';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
  }
  return secret;
}

export function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export async function verifyUserPassword(user, password) {
  const storedPassword = user.password;
  if (/^\$2[aby]\$/.test(storedPassword)) return verifyPassword(password, storedPassword);

  // Upgrade accounts created by the previous plaintext-password implementation on login.
  const candidate = Buffer.from(password);
  const stored = Buffer.from(storedPassword);
  const matches = candidate.length === stored.length && timingSafeEqual(candidate, stored);
  if (matches) {
    user.password = await hashPassword(password);
    await user.save();
  }
  return matches;
}

export function createAccessToken(user) {
  return jwt.sign({ role: user.role }, getJwtSecret(), {
    subject: user.id,
    expiresIn: TOKEN_LIFETIME,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function setAuthCookie(res, token) {
  res.cookie(TOKEN_COOKIE, token, cookieOptions());
}

export function clearAuthCookie(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(TOKEN_COOKIE, options);
}

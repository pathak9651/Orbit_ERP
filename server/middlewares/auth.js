import { createHash } from 'node:crypto';
import User from '../models/user.js';
import ImpersonationSession from '../models/impersonationSession.js';
import { hasPermission } from '../configs/authorization.js';
import { recordAuditEvent } from '../services/audit.js';
import { clearImpersonationCookie, IMPERSONATION_COOKIE, TOKEN_COOKIE, getSessionRejectionReason, isTokenVersionCurrent, verifyAccessToken } from '../services/auth.js';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Verifies a cookie or bearer JWT, reloads the account, and attaches it to the request. */
export async function authenticateToken(req, res, next) {
  const authorization = req.get('authorization');
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  const impersonationToken = req.cookies?.[IMPERSONATION_COOKIE];
  const administratorToken = req.cookies?.[TOKEN_COOKIE] || bearer;
  const token = impersonationToken || administratorToken;
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  function restoreAdministratorSession() {
    if (!impersonationToken || !administratorToken) return false
    req.cookies[IMPERSONATION_COOKIE] = ''
    clearImpersonationCookie(res)
    return authenticateToken(req, res, next)
  }

  try {
    let payload
    try { payload = verifyAccessToken(token) }
    catch (error) {
      const fallback = restoreAdministratorSession()
      if (fallback) return fallback
      throw error
    }
    const user = await User.findById(payload.sub).select('name email role department isVerified tokenVersion createdAt updatedAt').populate('department', 'name');
    const rejectionReason = getSessionRejectionReason(payload, user);
    if (rejectionReason) {
      const fallback = restoreAdministratorSession()
      if (fallback) return fallback
      if (rejectionReason === 'account-missing') return res.status(401).json({ message: 'Account no longer exists.' });
      if (rejectionReason === 'account-unverified') return res.status(403).json({ message: 'Your account is awaiting administrator verification.' });
      return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    }
    let actor = null
    let impersonation = null
    if (payload.impersonation) {
      const claims = payload.impersonation
      const sessionIdHash = createHash('sha256').update(String(claims.sessionId || '')).digest('hex')
      const [session, administrator] = await Promise.all([
        ImpersonationSession.findOne({ sessionIdHash, administrator: claims.actorId, targetUser: user._id, revokedAt: null, expiresAt: { $gt: new Date() } }).select('+sessionIdHash').lean(),
        User.findById(claims.actorId).select('name role isVerified tokenVersion').lean(),
      ])
      if (!session || !administrator || administrator.role !== 'admin' || administrator.isVerified === false || !isTokenVersionCurrent({ tokenVersion: claims.actorTokenVersion }, administrator.tokenVersion)) {
        const fallback = restoreAdministratorSession()
        if (fallback) return fallback
        return res.status(401).json({ message: 'This impersonation session has expired. Return to your administrator session.' })
      }
      actor = administrator
      impersonation = { reason: session.reason, administratorName: administrator.name, sessionId: claims.sessionId }
    }
    req.user = user;
    req.auth = { userId: payload.sub, role: user.role, actorId: actor?._id || user._id, isImpersonating: Boolean(impersonation), impersonation };
    if (impersonation && !SAFE_HTTP_METHODS.has(req.method.toUpperCase()) && req.path !== '/impersonation/stop') {
      await recordAuditEvent(req, { eventType: 'impersonated_action', outcome: 'requested', details: { impersonationReason: impersonation.reason, requestMethod: req.method.slice(0, 10), requestPath: `/api${req.path}`.slice(0, 180) } })
    }
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    }
    return next(error);
  }
}

/** Blocks account-security changes while an administrator is acting through a user's account. */
export function rejectImpersonatedSecurityChanges(req, res, next) {
  if (req.auth?.isImpersonating) return res.status(403).json({ message: 'Account security settings cannot be changed during impersonation.' })
  return next()
}

/** Creates a route guard that allows only the listed account roles. */
export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to access this resource.' });
    }
    return next();
  };
}

/** Applies one named policy from the central authorization catalog to a route. */
export function authorizePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user, permission)) {
      return res.status(403).json({ message: 'You do not have permission to access this resource.' });
    }
    return next();
  };
}




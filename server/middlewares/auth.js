import User from '../models/user.js';
import { TOKEN_COOKIE, getSessionRejectionReason, verifyAccessToken } from '../services/auth.js';

/** Verifies a cookie or bearer JWT, reloads the account, and attaches it to the request. */
export async function authenticateToken(req, res, next) {
  const authorization = req.get('authorization');
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  const token = req.cookies?.[TOKEN_COOKIE] || bearer;
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('name email role department isVerified tokenVersion createdAt updatedAt').populate('department', 'name');
    const rejectionReason = getSessionRejectionReason(payload, user);
    if (rejectionReason === 'account-missing') return res.status(401).json({ message: 'Account no longer exists.' });
    if (rejectionReason === 'account-unverified') return res.status(403).json({ message: 'Your account is awaiting administrator verification.' });
    if (rejectionReason === 'token-revoked') return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    req.user = user;
    req.auth = { userId: payload.sub, role: payload.role };
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    }
    return next(error);
  }
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




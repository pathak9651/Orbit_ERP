import User from '../models/user.js';
import { TOKEN_COOKIE, verifyAccessToken } from '../services/auth.js';

export async function authenticateToken(req, res, next) {
  const authorization = req.get('authorization');
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  const token = req.cookies?.[TOKEN_COOKIE] || bearer;
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('name email role department isVerified createdAt updatedAt').populate('department', 'name');
    if (!user) return res.status(401).json({ message: 'Account no longer exists.' });
    if (user.isVerified === false) return res.status(403).json({ message: 'Your account is awaiting administrator verification.' });
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

export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to access this resource.' });
    }
    return next();
  };
}




import User from '../models/user.js';
import { recordAuditEvent } from '../services/audit.js';
import { notifyUsers } from '../services/notifications.js';
import Role from '../models/role.js';
import {
  clearAuthCookie,
  createAccessToken,
  hashPassword,
  setAuthCookie,
  TOKEN_COOKIE,
  verifyAccessToken,
  verifyUserPassword,
} from '../services/auth.js';

async function recordAuthAudit(req, event) {
  try { await recordAuditEvent(req, event); }
  catch (error) { console.error('Security audit write failed:', error.message); }
}

/** Removes private fields and adds role and department labels for API responses. */
async function toPublicUser(user) {
  const roleRecord = await Role.findOne({ key: user.role }).select('name').lean()
  const builtInNames = { admin: 'Admin', hr: 'HR', manager: 'Manager', employee: 'Employee', housekeeping: 'Housekeeping', accountant: 'Accountant', user: 'Employee' }
  const roleName = roleRecord?.name || builtInNames[user.role] || user.role.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  return {
    id: user.id,
    accountId: user.accountId,
    name: user.name,
    email: user.email,
    role: user.role === 'user' ? 'employee' : user.role,
    roleName,
    isVerified: user.isVerified !== false,
    department: user.department ? { id: user.department.id, name: user.department.name } : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

/** Validates a registration request and queues its account for administrator approval. */
export async function signUp(req, res, next) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }
  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ message: 'Name must be between 2 and 80 characters.' });
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and no more than 72 bytes.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  try {
    const user = await User.create({ name, email, password: await hashPassword(password), isVerified: false });
    const admins = await User.find({ role: 'admin', isVerified: { $ne: false } }).distinct('_id');
    await notifyUsers(admins, {
      type: 'account', title: 'Account approval needed', message: `${name} requested access to Orbit ERP.`,
      page: 'users', entityId: String(user._id),
    });
    return res.status(202).json({ message: 'Your account request has been sent to an administrator for approval.' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }
    return next(error);
  }
}

/** Checks credentials and starts a cookie-backed JWT session for a verified account. */
export async function signIn(req, res, next) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const user = await User.findOne({ email }).select('+password').populate('department', 'name');
    if (!user || !(await verifyUserPassword(user, password))) {
      await recordAuthAudit(req, { eventType: 'login', outcome: 'failure', targetUser: user?._id || null });
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (user.isVerified === false) {
      await recordAuthAudit(req, { eventType: 'login', outcome: 'failure', targetUser: user._id, details: { reason: 'unverified' } });
      return res.status(403).json({ message: 'Your account is awaiting administrator verification.' });
    }
    setAuthCookie(res, createAccessToken(user));
    await recordAuthAudit(req, { eventType: 'login', targetUser: user._id });
    return res.json({ user: await toPublicUser(user) });
  } catch (error) {
    return next(error);
  }
}

/** Returns the authenticated account in its public response shape. */
export async function getCurrentUser(req, res) {
  return res.json({ user: await toPublicUser(req.user) });
}

/** Updates a user's name or email, requiring current-password proof for email changes. */
export async function updateProfile(req, res, next) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ message: 'Name must be between 2 and 80 characters.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  try {
    const user = await User.findById(req.user.id).select('+password').populate('department', 'name');
    if (!user) return res.status(404).json({ message: 'Account not found.' });

    if (email !== user.email) {
      const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      if (!currentPassword || !(await verifyUserPassword(user, currentPassword))) {
        return res.status(401).json({ message: 'Enter your current password to change your email.' });
      }
      user.email = email;
    }

    user.name = name;
    await user.save();
    return res.json({ user: await toPublicUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }
    return next(error);
  }
}

/** Changes the password only after verifying the current password, then refreshes the token. */
export async function changePassword(req, res, next) {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new passwords are required.' });
  }
  if (newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ message: 'New password must be at least 8 characters and no more than 72 bytes.' });
  }

  try {
    const user = await User.findById(req.user.id).select('+password').populate('department', 'name');
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    if (!(await verifyUserPassword(user, currentPassword))) {
      return res.status(401).json({ message: 'Your current password is incorrect.' });
    }
    if (await verifyUserPassword(user, newPassword)) {
      return res.status(400).json({ message: 'Choose a password you have not used as your current password.' });
    }

    user.password = await hashPassword(newPassword);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    setAuthCookie(res, createAccessToken(user));
    await recordAuthAudit(req, { eventType: 'password_changed', targetUser: user._id });
    await recordAuthAudit(req, { eventType: 'session_revoked', targetUser: user._id, details: { reason: 'password_changed' } });
    return res.json({ user: await toPublicUser(user), message: 'Password updated successfully.' });
  } catch (error) {
    return next(error);
  }
}

/** Revokes all of this user's JWTs before clearing the current browser cookie. */
export async function signOut(req, res, next) {
  const authorization = req.get('authorization');
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  const token = req.cookies?.[TOKEN_COOKIE] || bearer;
  let payload = null;

  if (token) {
    try {
      payload = verifyAccessToken(token);
    } catch (error) {
      if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') {
        return next(error);
      }
    }
  }

  try {
    // Only a signed token can identify the account whose outstanding sessions are revoked.
    if (payload?.sub) {
      await User.updateOne({ _id: payload.sub }, { $inc: { tokenVersion: 1 } });
      await recordAuthAudit(req, { eventType: 'session_revoked', targetUser: payload.sub });
    }
  } catch (error) {
    clearAuthCookie(res);
    return next(error);
  }
  clearAuthCookie(res);
  return res.status(204).end();
}

/** Provides a minimal protected response for the administrator access check endpoint. */
export function getAdminDashboard(req, res) {
  return res.json({ message: 'Admin access granted.' });
}






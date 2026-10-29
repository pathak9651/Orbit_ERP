import { hasPermission } from '../configs/authorization.js'

/** Delegates invoice access to the central role and Accounts department policy. */
export function authorizeBillingAccess(req, res, next) {
  if (hasPermission(req.user, 'billing.manage')) return next()
  return res.status(403).json({ message: 'Billing is available to admins, HR, managers, accountants, and Accounts department staff.' })
}

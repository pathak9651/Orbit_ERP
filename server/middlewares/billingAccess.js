// These elevated roles and the Accounts department are permitted to manage invoices.
const elevatedBillingRoles = new Set(['admin', 'hr', 'manager', 'accountant'])

/** Allows billing roles or Accounts department members to continue to invoice routes. */
export function authorizeBillingAccess(req, res, next) {
  const departmentName = typeof req.user?.department?.name === 'string' ? req.user.department.name : ''
  const isAccountsDepartment = /account/i.test(departmentName)
  if (elevatedBillingRoles.has(req.user?.role) || isAccountsDepartment) return next()
  return res.status(403).json({ message: 'Billing is available to admins, HR, managers, accountants, and Accounts department staff.' })
}

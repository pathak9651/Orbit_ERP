// Keep page visibility aligned with the server's billing-access middleware.
const billingRoles = new Set(['admin', 'hr', 'manager', 'accountant'])

export function canAccessBilling(user) {
  const department = typeof user?.department === 'string' ? user.department : user?.department?.name || ''
  return billingRoles.has(user?.role) || /account/i.test(department)
}

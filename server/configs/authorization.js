/**
 * Central authorization catalog for Orbit ERP.
 *
 * Change these policies to change server permissions. Route middleware enforces
 * them; controllers add ownership, department, hierarchy, and workflow checks
 * where a role alone is not enough to grant access.
 *
 * Custom roles receive only authenticated workspace access by default. They do
 * not inherit privileged permissions from their hierarchy level automatically.
 *
 * Scope rules that intentionally remain in controllers/services:
 * - Tasks: managers assign within their department and below their hierarchy;
 *   staff can see/update only tasks assigned to them (or assigned by them).
 * - Attendance: managers see/review only their department; staff see their own.
 * - Leave: a reviewer acts only at the request's current stage; managers are
 *   limited to their department; only admin makes the final decision.
 * - Chat: direct conversations require the same department, except admin/HR
 *   cross-department access; department rooms are scoped by membership/admin.
 * - Email history: ordinary staff see their own sent messages; admin can see all.
 * - Billing: grants are role based, with an additional Accounts department
 *   grant. Invoice actions remain protected by the same billing middleware.
 *
 * To change access, update the policy below and its built-in role summary.
 * Dynamic scope rules should be changed in the named controller/service above.
 */
export const AUTHORIZATION_POLICIES = Object.freeze({
  'workspace.read': Object.freeze({ roles: '*' }),
  'admin.manage': Object.freeze({ roles: ['admin'] }),
  'tasks.assign': Object.freeze({ roles: ['admin', 'hr', 'manager'] }),
  'tasks.viewOrganization': Object.freeze({ roles: ['admin', 'hr'] }),
  'tasks.updateAny': Object.freeze({ roles: ['admin', 'hr'] }),
  'attendance.viewOrganization': Object.freeze({ roles: ['admin', 'hr'] }),
  'attendance.viewDepartment': Object.freeze({ roles: ['manager'] }),
  'attendance.reviewLocation': Object.freeze({ roles: ['admin', 'hr', 'manager'] }),
  'leave.reviewQueue': Object.freeze({ roles: ['admin', 'hr', 'manager'] }),
  'leave.forward': Object.freeze({ roles: ['hr', 'manager'] }),
  'leave.finalDecision': Object.freeze({ roles: ['admin'] }),
  'calendar.read': Object.freeze({ roles: '*' }),
  'calendar.schedule': Object.freeze({ roles: ['admin', 'hr'] }),
  'calendar.manage': Object.freeze({ roles: ['admin'] }),
  'documents.read': Object.freeze({ roles: '*' }),
  'documents.upload': Object.freeze({ roles: ['admin'] }),
  'documents.download': Object.freeze({ roles: ['admin'] }),
  'billing.manage': Object.freeze({ roles: ['admin', 'hr', 'manager', 'accountant'], departmentPattern: /account/i }),
  'chat.viewOrganizationRooms': Object.freeze({ roles: ['admin'] }),
  'chat.crossDepartmentContacts': Object.freeze({ roles: ['admin', 'hr'] }),
  'chat.manageAnyRoom': Object.freeze({ roles: ['admin'] }),
  'email.directory': Object.freeze({ roles: '*' }),
  'email.send': Object.freeze({ roles: '*' }),
  'email.viewOwnHistory': Object.freeze({ roles: '*' }),
  'email.viewAllHistory': Object.freeze({ roles: ['admin'] }),
})

/** Describes the built-in role grants in one place for administrators and maintainers. */
export const BUILT_IN_ROLE_PERMISSIONS = Object.freeze({
  admin: Object.freeze(['admin.manage', 'tasks.assign', 'tasks.viewOrganization', 'tasks.updateAny', 'attendance.viewOrganization', 'attendance.reviewLocation', 'leave.reviewQueue', 'leave.finalDecision', 'calendar.read', 'calendar.schedule', 'calendar.manage', 'documents.read', 'documents.upload', 'documents.download', 'billing.manage', 'chat.viewOrganizationRooms', 'chat.crossDepartmentContacts', 'chat.manageAnyRoom', 'email.directory', 'email.send', 'email.viewOwnHistory', 'email.viewAllHistory']),
  hr: Object.freeze(['tasks.assign', 'tasks.viewOrganization', 'tasks.updateAny', 'attendance.viewOrganization', 'attendance.reviewLocation', 'leave.reviewQueue', 'leave.forward', 'calendar.read', 'calendar.schedule', 'documents.read', 'billing.manage', 'chat.crossDepartmentContacts', 'email.directory', 'email.send', 'email.viewOwnHistory']),
  manager: Object.freeze(['tasks.assign', 'attendance.viewDepartment', 'attendance.reviewLocation', 'leave.reviewQueue', 'leave.forward', 'calendar.read', 'documents.read', 'billing.manage', 'email.directory', 'email.send', 'email.viewOwnHistory']),
  accountant: Object.freeze(['calendar.read', 'documents.read', 'billing.manage', 'email.directory', 'email.send', 'email.viewOwnHistory']),
  employee: Object.freeze(['calendar.read', 'documents.read', 'email.directory', 'email.send', 'email.viewOwnHistory']),
  housekeeping: Object.freeze(['calendar.read', 'documents.read', 'email.directory', 'email.send', 'email.viewOwnHistory']),
  user: Object.freeze(['calendar.read', 'documents.read', 'email.directory', 'email.send', 'email.viewOwnHistory']),
})

/** Checks the signed-in user's role and any policy-specific department grant. */
export function hasPermission(user, permission) {
  const policy = AUTHORIZATION_POLICIES[permission]
  if (!user || !policy) return false
  if (policy.roles === '*') return true
  if (policy.roles.includes(user.role)) return true
  const departmentName = typeof user.department === 'string' ? user.department : user.department?.name || ''
  return Boolean(policy.departmentPattern && policy.departmentPattern.test(departmentName))
}

/** HR may add meetings; admins may add every supported calendar event type. */
export function canScheduleCalendarType(user, eventType) {
  return hasPermission(user, 'calendar.schedule') && (user.role === 'admin' || eventType === 'meeting')
}

import { hasPermission } from '../configs/authorization.js'

/** Enforces global admin access, cross-team HR access, and department-scoped staff chat. */
export function canUsersChat(firstUser, secondUser) {
  if (!firstUser || !secondUser || String(firstUser._id) === String(secondUser._id)) return false
  if (hasPermission(firstUser, 'chat.viewOrganizationRooms') || hasPermission(secondUser, 'chat.viewOrganizationRooms')) return true
  if (hasPermission(firstUser, 'chat.crossDepartmentContacts') || hasPermission(secondUser, 'chat.crossDepartmentContacts')) return true
  return Boolean(firstUser.department && secondUser.department && String(firstUser.department._id || firstUser.department) === String(secondUser.department._id || secondUser.department))
}

/** Confirms a user belongs to a department room, with administrators able to moderate all rooms. */
export function canAccessDepartmentRoom(user, departmentId) {
  return hasPermission(user, 'chat.viewOrganizationRooms') || String(user?.department?._id || user?.department || '') === String(departmentId)
}

/** Builds the conversation ownership predicate before loading protected chat data. */
export function getConversationAccessFilter(user) {
  const accessConditions = [{ participants: user._id }]
  if (hasPermission(user, 'chat.manageAnyRoom')) {
    accessConditions.push({ type: 'department' })
  } else if (user.department) {
    accessConditions.push({ type: 'department', department: user.department._id || user.department })
  }
  return { $or: accessConditions }
}

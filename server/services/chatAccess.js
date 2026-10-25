/** Enforces global admin access, cross-team HR access, and department-scoped staff chat. */
export function canUsersChat(firstUser, secondUser) {
  if (!firstUser || !secondUser || String(firstUser._id) === String(secondUser._id)) return false
  if (firstUser.role === 'admin' || secondUser.role === 'admin') return true
  if (firstUser.role === 'hr' || secondUser.role === 'hr') return true
  return Boolean(firstUser.department && secondUser.department && String(firstUser.department._id || firstUser.department) === String(secondUser.department._id || secondUser.department))
}

/** Confirms a user belongs to a department room, with administrators able to moderate all rooms. */
export function canAccessDepartmentRoom(user, departmentId) {
  return user?.role === 'admin' || String(user?.department?._id || user?.department || '') === String(departmentId)
}

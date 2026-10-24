/** Central API client: sends cookie-authenticated requests and reports server errors consistently. */
async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
  })

  if (response.status === 204) return null

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.message || 'The request could not be completed.')
    error.status = response.status
    throw error
  }
  return result
}

/** Loads the signed-in user from the HTTP-only session cookie. */
export function getCurrentUser() {
  return request('/api/me')
}

/** Loads the current user's notification feed and unread count. */
export function getNotifications() {
  return request('/api/notifications')
}

/** Marks one notification as read through the authenticated API. */
export function markNotificationRead(id) {
  return request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' })
}

/** Marks the current user's full notification feed as read. */
export function markAllNotificationsRead() {
  return request('/api/notifications/read-all', { method: 'PATCH' })
}

/** Fetches verified people available in the workspace email directory. */
export function getEmailDirectory() {
  return request('/api/mail/directory')
}

export function getSentEmails() {
  return request('/api/mail/sent')
}

/** Fetches invoices the current account is allowed to manage. */
export function getInvoices() {
  return request('/api/billing/invoices')
}

export function createInvoice(details) {
  return request('/api/billing/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

export function updateInvoiceStatus(id, status) {
  return request(`/api/billing/invoices/${encodeURIComponent(id)}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
}

export async function downloadInvoicePdf(id, invoiceNumber) {
  const response = await fetch(`/api/billing/invoices/${encodeURIComponent(id)}/pdf`, { credentials: 'include' })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.message || 'Could not download the invoice PDF.')
  }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = `${invoiceNumber || 'invoice'}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function emailInvoice(id) {
  return request(`/api/billing/invoices/${encodeURIComponent(id)}/email`, { method: 'POST' })
}

export function sendWorkspaceEmail(details) {
  return request('/api/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  })
}

/** Starts a session using the server's HTTP-only authentication cookie. */
export function signIn(credentials) {
  return request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })
}

/** Submits a registration request for administrator verification. */
export function signUp(details) {
  return request('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  })
}

/** Ends the server session and clears its authentication cookie. */
export function signOut() {
  return request('/api/logout', { method: 'POST' })
}

export function updateProfile(details) {
  return request('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  })
}

export function updatePassword(details) {
  return request('/api/profile/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  })
}

export function getAdminUsers() {
  return request('/api/admin/users')
}

export function updateAdminUser(id, updates) {
  return request(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
}

export function getAdminOrganization() {
  return request('/api/admin/organization')
}

export function createAdminRole(name) {
  return request('/api/admin/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function deleteAdminRole(id) {
  return request(`/api/admin/roles/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function createAdminDepartment(name) {
  return request('/api/admin/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function deleteAdminDepartment(id) {
  return request(`/api/admin/departments/${encodeURIComponent(id)}`, { method: 'DELETE' })
}


export function getTasks() {
  return request('/api/tasks')
}

export function getTaskAssignees() {
  return request('/api/tasks/assignees')
}

export function createTask(details) {
  return request('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

export function updateTaskStatus(id, status) {
  return request(`/api/tasks/${encodeURIComponent(id)}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
}

export function getAttendance() {
  return request('/api/attendance')
}

export function checkIn(location) {
  return request('/api/attendance/check-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location }),
  })
}

export function checkOut() {
  return request('/api/attendance/check-out', { method: 'POST' })
}

export function getAdminMonthlyAttendance(month) {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  return request(`/api/admin/attendance/month${query}`)
}

export function getLeaveRequests() {
  return request('/api/leaves')
}

export function createLeaveRequest(details) {
  return request('/api/leaves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

export function actOnLeaveRequest(id, action, message) {
  return request(`/api/leaves/${encodeURIComponent(id)}/action`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, message }) })
}

export function getAdminApprovedLeaves(month) {
  return request(`/api/admin/leaves/approved?month=${encodeURIComponent(month)}`)
}


export function updateAttendanceLocation(location) {
  return request('/api/attendance/location', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location }),
  })
}

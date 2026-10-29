import { validateClientForm } from './validation.js'

/** Finds the matching reusable client validation schema for a mutation route. */
function requestValidationSchema(path, method) {
  const route = path.split('?')[0]
  const exactRoutes = {
    'POST /api/login': 'login', 'POST /api/signup': 'signup',
    'POST /api/forgot-password': 'forgotPassword', 'POST /api/reset-password': 'resetPassword',
    'POST /api/calendar/events': 'calendarEvent',
    'PATCH /api/profile': 'profile', 'PATCH /api/profile/password': 'password',
    'POST /api/mail/send': 'email', 'POST /api/billing/invoices': 'invoice',
    'POST /api/tasks': 'task', 'POST /api/leaves': 'leave',
    'POST /api/attendance/check-in': 'checkIn', 'PATCH /api/attendance/location': 'location',
    'POST /api/attendance/location-correction': 'locationCorrection',
    'PATCH /api/attendance/location-review': 'locationReview',
    'POST /api/admin/users': 'adminUser', 'POST /api/admin/users/import': 'userImport',
    'POST /api/admin/users/import/google-sheet': 'googleSheet',
    'POST /api/admin/customers': 'crmCustomer', 'PATCH /api/admin/customers/:id': 'crmCustomer',
    'POST /api/admin/customers/import': 'crmCustomerImport',
    'POST /api/admin/inventory': 'inventoryItem', 'PATCH /api/admin/inventory/:id': 'inventoryItem',
    'POST /api/admin/revenue/transactions': 'revenueTransaction', 'PATCH /api/admin/revenue/transactions/:id': 'revenueTransaction',
    'POST /api/admin/users/:id/impersonate': 'impersonation',
    'POST /api/admin/roles': 'organizationRole', 'POST /api/admin/departments': 'organizationDepartment',
    'POST /api/chat/direct': 'chatDirect', 'POST /api/chat/department': 'chatDepartment',
  }
  const routeKey = `${method.toUpperCase()} ${route}`
  if (exactRoutes[routeKey]) return exactRoutes[routeKey]
  if (method.toUpperCase() === 'PATCH' && /^\/api\/admin\/users\/[^/]+$/.test(route)) return 'adminUserUpdate'
  if (method.toUpperCase() === 'POST' && /^\/api\/admin\/users\/[^/]+\/impersonate$/.test(route)) return 'impersonation'
  if (method.toUpperCase() === 'PATCH' && /^\/api\/admin\/customers\/[^/]+$/.test(route)) return 'crmCustomer'
  if (method.toUpperCase() === 'PATCH' && /^\/api\/admin\/inventory\/[^/]+$/.test(route)) return 'inventoryItem'
  if (method.toUpperCase() === 'PATCH' && /^\/api\/admin\/revenue\/transactions\/[^/]+$/.test(route)) return 'revenueTransaction'
  if (method.toUpperCase() === 'PATCH' && /^\/api\/tasks\/[^/]+\/status$/.test(route)) return 'taskStatus'
  if (method.toUpperCase() === 'PATCH' && /^\/api\/leaves\/[^/]+\/action$/.test(route)) return 'leaveAction'
  if (method.toUpperCase() === 'PATCH' && /^\/api\/billing\/invoices\/[^/]+\/status$/.test(route)) return 'invoiceStatus'
  if (method.toUpperCase() === 'POST' && /^\/api\/attendance\/[^/]+\/location-correction$/.test(route)) return 'locationCorrection'
  if (method.toUpperCase() === 'PATCH' && /^\/api\/attendance\/[^/]+\/location-review$/.test(route)) return 'locationReview'
  if (method.toUpperCase() === 'POST' && /^\/api\/chat\/conversations\/[^/]+\/messages$/.test(route)) return 'chatMessage'
  if (method.toUpperCase() === 'PATCH' && /^\/api\/calendar\/events\/[^/]+$/.test(route)) return 'calendarEvent'
  return ''
}

/** Central API client: sends cookie-authenticated requests and reports server errors consistently. */
async function request(path, options = {}) {
  const method = options.method || 'GET'
  const schemaName = requestValidationSchema(path, method)
  if (schemaName) {
    let payload
    try { payload = JSON.parse(options.body || 'null') }
    catch { throw new Error('The form data could not be prepared. Please review it and try again.') }
    const validationMessage = validateClientForm(schemaName, payload)
    if (validationMessage) {
      const error = new Error(validationMessage)
      error.status = 400
      throw error
    }
  }
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
  })

  if (response.status === 204) return null

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.message || 'The request could not be completed.')
    error.status = response.status
    const retryAfterSeconds = Number(response.headers.get('retry-after'))
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) error.retryAfterSeconds = retryAfterSeconds
    throw error
  }
  return result
}

/** Adds optional server-side list filters without including empty values. */
function withQuery(path, parameters = {}) {
  const query = new URLSearchParams()
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const queryString = query.toString()
  return queryString ? `${path}?${queryString}` : path
}

/** Loads the signed-in user from the HTTP-only session cookie. */
export function getCurrentUser() {
  return request('/api/me')
}

/** Loads a privacy-scoped daily summary for the signed-in user's home dashboard. */
export function getHomeSummary() {
  return request('/api/home')
}

/** Loads date, department, and attendance-location filtered company metrics for administrators. */
export function getAdminOverview(parameters) {
  return request(withQuery('/api/admin/overview', parameters))
}

/** Loads aggregate, period-based company reports for administrator dashboards. */
export function getAdminReports(parameters) {
  return request(withQuery('/api/admin/reports', parameters))
}

/** Loads the paginated revenue ledger, selected-period totals, and transaction trend. */
export function getRevenue(parameters) {
  return request(withQuery('/api/admin/revenue', parameters))
}

/** Creates an admin-entered income, expense, refund, or transfer ledger entry. */
export function createRevenueTransaction(details) {
  return request('/api/admin/revenue/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

/** Updates a revenue ledger entry using server and client validation. */
export function updateRevenueTransaction(id, details) {
  return request(`/api/admin/revenue/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

/** Deletes an admin-managed ledger entry. */
export function deleteRevenueTransaction(id) {
  return request(`/api/admin/revenue/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Downloads a date-scoped, formula-safe revenue ledger CSV. */
export async function downloadRevenueCsv(parameters) {
  const response = await fetch(withQuery('/api/admin/revenue/export.csv', parameters), { credentials: 'include' })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.message || 'Could not export revenue transactions.')
  }
  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = 'orbit-revenue-transactions.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

/** Loads searchable office stock with summary counts and server-side pagination. */
export function getInventory(parameters) {
  return request(withQuery('/api/admin/inventory', parameters))
}

/** Creates an inventory record through the admin-only API. */
export function createInventoryItem(details) {
  return request('/api/admin/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

/** Updates inventory details through the admin-only API. */
export function updateInventoryItem(id, details) {
  return request(`/api/admin/inventory/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

/** Deletes an inventory record through the admin-only API. */
export function deleteInventoryItem(id) {
  return request(`/api/admin/inventory/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Loads the current user's notification feed and unread count. */
export function getNotifications(parameters) {
  return request(withQuery('/api/notifications', parameters))
}

/** Loads one server-paginated page of shared company documents. */
export function getDocuments(parameters) {
  return request(withQuery('/api/documents', parameters))
}

/** Loads events for a month or date interval through the server-side calendar pagination API. */
export function getCalendarEvents(parameters) {
  return request(withQuery('/api/calendar/events', parameters))
}

/** Creates an administrator-managed calendar entry or an HR-scheduled meeting. */
export function createCalendarEvent(details) {
  return request('/api/calendar/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

/** Updates an event; the server limits this action to administrators. */
export function updateCalendarEvent(id, details) {
  return request(`/api/calendar/events/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

/** Deletes an event; the server limits this action to administrators. */
export function deleteCalendarEvent(id) {
  return request(`/api/calendar/events/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Sends a selected document to the administrator-only upload endpoint. */
export function uploadDocument(file, description = '') {
  const parameters = new URLSearchParams({ filename: file.name, description })
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || ''
  const contentType = file.type || ({ '.pdf': 'application/pdf', '.txt': 'text/plain', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }[extension])
  return request(`/api/documents?${parameters.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType || 'application/octet-stream' },
    body: file,
  })
}

/** Downloads a private document through the authenticated document endpoint. */
export async function downloadDocumentFile(documentRecord) {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentRecord.id)}/download`, { credentials: 'include' })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.message || 'Could not download this document.')
  }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = documentRecord.originalName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Retrieves a read-only browser preview without using the administrator download endpoint. */
export async function viewDocumentFile(documentRecord) {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentRecord.id)}/view`, { credentials: 'include' })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.message || 'Could not open this document.')
  }
  return response.blob()
}

/** Loads the signed-in user's paginated chat list. */
export function getChatConversations(parameters) {
  return request(withQuery('/api/chat/conversations', parameters))
}

/** Searches the paginated directory of colleagues allowed by chat policy. */
export function getChatContacts(parameters) {
  return request(withQuery('/api/chat/contacts', parameters))
}

/** Loads the small department list used to open team rooms. */
export function getChatDepartments() {
  return request('/api/chat/departments')
}

/** Opens or creates a direct conversation with an authorized colleague. */
export function openDirectChat(userId) {
  return request('/api/chat/direct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
}

/** Opens or creates a department team room. */
export function openDepartmentChat(departmentId) {
  return request('/api/chat/department', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ departmentId }) })
}

/** Loads an authorized conversation's paginated message history. */
export function getChatMessages(conversationId, parameters) {
  return request(withQuery(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, parameters))
}

/** Marks a conversation's incoming messages read and notifies other connected members. */
export function markChatConversationRead(conversationId) {
  return request(`/api/chat/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'PATCH' })
}

/** Downloads the selected chat as a CSV using the existing cookie session. */
export async function downloadChatConversationCsv(conversationId, conversationName = 'conversation') {
  const response = await fetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/export.csv`, { credentials: 'include' })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.message || 'Could not export this conversation.')
  }
  const fileUrl = URL.createObjectURL(await response.blob())
  const downloadLink = document.createElement('a')
  downloadLink.href = fileUrl
  downloadLink.download = `orbit-chat-${conversationName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`
  document.body.appendChild(downloadLink)
  downloadLink.click()
  downloadLink.remove()
  window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000)
}

/** Saves a message; the server broadcasts it to connected conversation members. */
export function sendChatMessage(conversationId, body) {
  return request(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) })
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
export function getEmailDirectory(parameters) {
  return request(withQuery('/api/mail/directory', parameters))
}

export function getSentEmails(parameters) {
  return request(withQuery('/api/mail/sent', parameters))
}

/** Fetches invoices the current account is allowed to manage. */
export function getInvoices(parameters) {
  return request(withQuery('/api/billing/invoices', parameters))
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

export function requestPasswordReset(email) {
  return request('/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
}

export function resetPassword(details) {
  return request('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
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

/** Uploads the current user's validated image as a binary request body. */
export function updateProfileImage(imageFile) {
  return request('/api/profile/image', {
    method: 'PUT',
    headers: { 'Content-Type': imageFile.type },
    body: imageFile,
  })
}

export function updatePassword(details) {
  return request('/api/profile/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  })
}

export function getAdminUsers(parameters) {
  return request(withQuery('/api/admin/users', parameters))
}

/** Loads one server-paginated page of administrator CRM customer records. */
export function getAdminCustomers(parameters) { return request(withQuery('/api/admin/customers', parameters)) }

/** Creates one CRM customer record from the administrator's form. */
export function createAdminCustomer(details) {
  return request('/api/admin/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

/** Replaces editable CRM contact and relationship fields for an existing customer. */
export function updateAdminCustomer(id, details) {
  return request(`/api/admin/customers/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

/** Deletes one customer record through the administrator-only CRM route. */
export function deleteAdminCustomer(id) {
  return request(`/api/admin/customers/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Sends a capped spreadsheet batch to the administrator-only customer import route. */
export function importAdminCustomers(customers) {
  return request('/api/admin/customers/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customers }) })
}

/** Downloads CRM customer records as a CSV through the current cookie session. */
export async function downloadAdminCustomersCsv() {
  const response = await fetch('/api/admin/customers/export.csv', { credentials: 'include' })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.message || 'Could not export CRM customers.')
  }
  const fileUrl = URL.createObjectURL(await response.blob())
  const downloadLink = document.createElement('a')
  downloadLink.href = fileUrl
  downloadLink.download = `orbit-crm-customers-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(downloadLink)
  downloadLink.click()
  downloadLink.remove()
  window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000)
}

/** Loads the read-only, paginated audit feed available to administrators. */
export function getAuditEvents(parameters) { return request(withQuery('/api/admin/audit-events', parameters)) }

/** Creates an account through the administrator-only user management API. */
export function createAdminUser(details) {
  return request('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  })
}

/** Sends spreadsheet rows to the admin-only bulk user import endpoint. */
export function importAdminUsers(users) {
  return request('/api/admin/users/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ users }),
  })
}

/** Imports rows from a publicly viewable Google Sheet link. */
export function importAdminUsersFromGoogleSheet(sheetUrl) {
  return request('/api/admin/users/import/google-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetUrl }),
  })
}

/** Downloads the complete administrator CSV export using the signed-in session cookie. */
export async function downloadAdminDataCsv() {
  const response = await fetch('/api/admin/export.csv', { credentials: 'include' })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.message || 'Could not export ERP data.')
  }

  const fileUrl = URL.createObjectURL(await response.blob())
  const downloadLink = document.createElement('a')
  downloadLink.href = fileUrl
  downloadLink.download = `orbit-erp-export-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(downloadLink)
  downloadLink.click()
  downloadLink.remove()
  window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000)
}

export function updateAdminUser(id, updates) {
  return request(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
}

/** Permanently deletes one account through the admin-only user management route. */
export function deleteAdminUser(id) {
  return request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Starts a short-lived user view after the administrator supplies a support reason. */
export function startUserImpersonation(id, reason) {
  return request(`/api/admin/users/${encodeURIComponent(id)}/impersonate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
}

/** Ends the active impersonation cookie and restores the preserved administrator session. */
export function stopUserImpersonation() {
  return request('/api/impersonation/stop', { method: 'POST' })
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


export function getTasks(parameters) {
  return request(withQuery('/api/tasks', parameters))
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

export function getAttendance(parameters) {
  return request(withQuery('/api/attendance', parameters))
}

export function getAttendanceLocationReviews(parameters) {
  return request(withQuery('/api/attendance/location-reviews', parameters))
}

export function checkIn(location, exceptionReason = '') {
  return request('/api/attendance/check-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(location ? { location } : { exceptionReason }),
  })
}

export function checkOut() {
  return request('/api/attendance/check-out', { method: 'POST' })
}

export function getAdminMonthlyAttendance(month, parameters = {}) {
  return request(withQuery('/api/admin/attendance/month', { ...parameters, month }))
}

export function getLeaveRequests(parameters) {
  return request(withQuery('/api/leaves', parameters))
}

export function createLeaveRequest(details) {
  return request('/api/leaves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) })
}

export function actOnLeaveRequest(id, action, message) {
  return request(`/api/leaves/${encodeURIComponent(id)}/action`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, message }) })
}

export function getAdminApprovedLeaves(month, parameters = {}) {
  return request(withQuery('/api/admin/leaves/approved', { ...parameters, month }))
}


export function updateAttendanceLocation(location) {
  return request('/api/attendance/location', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location }),
  })
}

export function requestAttendanceLocationCorrection(id, location, reason) {
  return request(`/api/attendance/${encodeURIComponent(id)}/location-correction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location, reason }),
  })
}

export function reviewAttendanceLocation(id, decision, message) {
  return request(`/api/attendance/${encodeURIComponent(id)}/location-review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, message }),
  })
}

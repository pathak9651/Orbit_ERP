const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i
const MAX_PROFILE_IMAGE_BYTES = 1_572_864
export const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024
const SPREADSHEET_MIME_TYPES = new Set([
  '',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/octet-stream',
])

/** Checks the selected profile image type and size before sending it to the server. */
export function validateProfileImageFile(file) {
  if (!file) return 'Choose a profile image to upload.'
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG, or WebP image.'
  if (file.size <= 0) return 'The selected image is empty.'
  if (file.size > MAX_PROFILE_IMAGE_BYTES) return 'Profile images must be 1.5 MB or smaller.'
  return ''
}

/** Checks the Excel filename, declared type, size, and ZIP signature before parsing. */
export async function validateSpreadsheetFile(file) {
  if (!file || typeof file.name !== 'string' || typeof file.slice !== 'function') {
    return 'Choose an Excel .xlsx file.'
  }
  if (!/\.xlsx$/i.test(file.name)) return 'Choose an Excel .xlsx file. For CSV data, use a public Google Sheets link.'
  if (!Number.isFinite(file.size) || file.size <= 0) return 'The selected spreadsheet is empty.'
  if (file.size > MAX_SPREADSHEET_BYTES) return 'Choose a spreadsheet smaller than 5 MB.'
  if (!SPREADSHEET_MIME_TYPES.has(file.type || '')) return 'The selected file type is not supported. Choose an .xlsx spreadsheet.'

  try {
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    if (signature.length !== 4 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x03 || signature[3] !== 0x04) {
      return 'The selected file is not a valid .xlsx spreadsheet.'
    }
  } catch {
    return 'The selected spreadsheet could not be read.'
  }
  return ''
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

function textError(value, label, { required = true, min = 0, max = Infinity } = {}) {
  if (value === undefined && !required) return ''
  if (value === undefined) return `${label} is required.`
  if (typeof value !== 'string') return `${label} must be text.`
  const normalized = value.trim()
  if (required && !normalized) return `${label} is required.`
  if (normalized.length < min) return `${label} must contain at least ${min} characters.`
  if (normalized.length > max) return `${label} must contain no more than ${max} characters.`
  return ''
}

function emailError(value, { required = true } = {}) {
  const error = textError(value, 'Email address', { required, max: 254 })
  if (error) return error
  return value?.trim() && !EMAIL_PATTERN.test(value.trim()) ? 'Enter a valid email address.' : ''
}

function passwordError(value, label, { required = true, min = 0 } = {}) {
  const error = textError(value, label, { required, min, max: 72 })
  if (error) return error
  if (new TextEncoder().encode(value).length > 72) return `${label} must be no more than 72 bytes.`
  return ''
}

function makeSchema(allowedFields, validateFields, { requireObject = true } = {}) {
  return (value) => {
    if (requireObject && !isPlainObject(value)) return 'Send a JSON object with the requested form fields.'
    const unknownField = Object.keys(value).find((field) => !allowedFields.includes(field))
    if (unknownField) return `Unexpected field: ${unknownField}.`
    for (const validateField of validateFields) {
      const message = validateField(value)
      if (message) return message
    }
    return ''
  }
}

const schemas = {
  login: makeSchema(['email', 'password'], [
    (value) => emailError(value.email), (value) => passwordError(value.password, 'Password'),
  ]),
  forgotPassword: makeSchema(['email'], [(value) => emailError(value.email)]),
  resetPassword: makeSchema(['token', 'newPassword'], [(value) => textError(value.token, 'Reset token', { max: 200 }), (value) => passwordError(value.newPassword, 'New password', { min: 8 })]),
  signup: makeSchema(['name', 'phone', 'email', 'dateOfBirth', 'password', 'confirmPassword'], [
    (value) => textError(value.name, 'Full name', { min: 2, max: 80 }),
    (value) => {
      const error = textError(value.phone, 'Phone number', { min: 8, max: 25 })
      if (error) return error
      return /^\+?\d{8,15}$/.test(value.phone.trim().replace(/[\s().-]/g, '')) ? '' : 'Enter a valid phone number with 8 to 15 digits.'
    },
    (value) => emailError(value.email),
    (value) => validDate(value.dateOfBirth) && value.dateOfBirth <= new Date().toISOString().slice(0, 10) ? '' : 'Enter a valid date of birth that is not in the future.',
    (value) => passwordError(value.password, 'Password', { min: 8 }),
    (value) => value.confirmPassword === value.password ? '' : 'The passwords do not match.',
  ]),
  profile: makeSchema(['name', 'email', 'phone', 'dateOfBirth', 'currentPassword'], [
    (value) => textError(value.name, 'Name', { min: 2, max: 80 }),
    (value) => emailError(value.email),
    (value) => {
      if (value.phone === undefined || value.phone === '') return ''
      const error = textError(value.phone, 'Phone number', { required: false, max: 25 })
      return error || (/^\+?\d{8,15}$/.test(value.phone.replace(/[\s().-]/g, '')) ? '' : 'Enter a valid phone number with 8 to 15 digits.')
    },
    (value) => value.dateOfBirth === undefined || value.dateOfBirth === '' || (validDate(value.dateOfBirth) && value.dateOfBirth <= new Date().toISOString().slice(0, 10)) ? '' : 'Enter a valid date of birth that is not in the future.',
    (value) => value.currentPassword === undefined ? '' : passwordError(value.currentPassword, 'Current password', { required: false }),
  ]),
  password: makeSchema(['currentPassword', 'newPassword'], [
    (value) => passwordError(value.currentPassword, 'Current password'),
    (value) => passwordError(value.newPassword, 'New password', { min: 8 }),
  ]),
  adminUser: makeSchema(['name', 'email', 'password', 'role', 'departmentId', 'isVerified'], [
    (value) => textError(value.name, 'Name', { min: 2, max: 80 }),
    (value) => emailError(value.email), (value) => passwordError(value.password, 'Initial password', { min: 8 }),
    (value) => textError(value.role, 'Role', { max: 60 }),
    (value) => value.departmentId === undefined || value.departmentId === null || value.departmentId === '' || (typeof value.departmentId === 'string' && OBJECT_ID_PATTERN.test(value.departmentId)) ? '' : 'Choose a valid department.',
    (value) => value.isVerified === undefined || typeof value.isVerified === 'boolean' ? '' : 'Verification status must be true or false.',
  ]),
  adminUserUpdate: makeSchema(['role', 'departmentId', 'isVerified'], [
    (value) => Object.keys(value).length ? '' : 'Choose a role, department, or verification status to update.',
    (value) => value.role === undefined || (typeof value.role === 'string' && value.role.trim() && value.role.length <= 60) ? '' : 'Choose a valid role.',
    (value) => value.departmentId === undefined || value.departmentId === null || value.departmentId === '' || (typeof value.departmentId === 'string' && OBJECT_ID_PATTERN.test(value.departmentId)) ? '' : 'Choose a valid department.',
    (value) => value.isVerified === undefined || typeof value.isVerified === 'boolean' ? '' : 'Verification status must be true or false.',
  ]),
  task: makeSchema(['title', 'description', 'assignedTo', 'dueDate'], [
    (value) => textError(value.title, 'Task title', { min: 3, max: 120 }),
    (value) => value.description === undefined ? '' : textError(value.description, 'Task description', { required: false, max: 2000 }),
    (value) => typeof value.assignedTo === 'string' && OBJECT_ID_PATTERN.test(value.assignedTo) ? '' : 'Select a valid team member.',
    (value) => value.dueDate === undefined || value.dueDate === '' || validDate(value.dueDate) ? '' : 'Enter a valid due date.',
  ]),
  taskStatus: makeSchema(['status'], [(value) => ['pending', 'in-progress', 'completed'].includes(value.status) ? '' : 'Choose a valid task status.']),
  leave: makeSchema(['leaveType', 'startDate', 'endDate', 'reason'], [
    (value) => ['annual', 'sick', 'personal', 'unpaid'].includes(value.leaveType) ? '' : 'Select a valid leave type.',
    (value) => validDate(value.startDate) && validDate(value.endDate) && value.endDate >= value.startDate ? '' : 'Enter a valid leave date range.',
    (value) => textError(value.reason, 'Reason', { min: 3, max: 1000 }),
  ]),
  leaveAction: makeSchema(['action', 'message'], [
    (value) => ['forward', 'approve', 'reject'].includes(value.action) ? '' : 'Choose a valid leave action.',
    (value) => value.message === undefined ? '' : textError(value.message, 'Review message', { required: false, max: 1000 }),
    (value) => ['forward', 'reject'].includes(value.action) && (typeof value.message !== 'string' || value.message.trim().length < 3) ? 'Add a suggestion or decision message before continuing.' : '',
  ]),
  email: makeSchema(['recipientIds', 'subject', 'message'], [
    (value) => Array.isArray(value.recipientIds) && value.recipientIds.length >= 1 && value.recipientIds.length <= 200 && value.recipientIds.every((id) => typeof id === 'string' && OBJECT_ID_PATTERN.test(id)) ? '' : 'Choose between 1 and 200 valid recipients.',
    (value) => textError(value.subject, 'Subject', { max: 180 }),
    (value) => textError(value.message, 'Message', { max: 20000 }),
  ]),
  invoice: makeSchema(['customerName', 'customerEmail', 'dueDate', 'notes', 'status', 'items'], [
    (value) => textError(value.customerName, 'Customer name', { min: 2, max: 120 }),
    (value) => value.customerEmail === undefined ? '' : emailError(value.customerEmail, { required: false }),
    (value) => value.status === undefined || ['draft', 'sent'].includes(value.status) ? '' : 'Choose a valid initial invoice status.',
    (value) => value.status === 'draft' || (typeof value.customerEmail === 'string' && value.customerEmail.trim()) ? '' : 'A customer email is required to send an invoice.',
    (value) => validDate(value.dueDate) ? '' : 'Choose a valid invoice due date.',
    (value) => value.notes === undefined ? '' : textError(value.notes, 'Invoice notes', { required: false, max: 1000 }),
    (value) => Array.isArray(value.items) && value.items.length >= 1 && value.items.length <= 10 ? '' : 'Add between 1 and 10 invoice items.',
    (value) => Array.isArray(value.items) ? value.items.reduce((error, item, index) => error || (!isPlainObject(item) ? `Invoice item ${index + 1} is invalid.` : typeof item.description !== 'string' || item.description.trim().length < 2 || item.description.trim().length > 160 ? `Invoice item ${index + 1} needs a valid description.` : !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || Number(item.quantity) > 100000 ? `Invoice item ${index + 1} needs a valid quantity.` : !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0 || Number(item.unitPrice) > 100000000 ? `Invoice item ${index + 1} needs a valid unit price.` : Object.keys(item).some((key) => !['description', 'quantity', 'unitPrice'].includes(key)) ? `Invoice item ${index + 1} contains an unexpected field.` : ''), '') : '',
  ]),
  organizationRole: makeSchema(['name'], [
    (value) => textError(value.name, 'Role name', { min: 2, max: 40 }),
    (value) => typeof value.name === 'string' && !/[a-z0-9]/i.test(value.name) ? 'Role name must include a letter or number.' : '',
  ]),
  organizationDepartment: makeSchema(['name'], [
    (value) => textError(value.name, 'Department name', { min: 2, max: 60 }),
    (value) => typeof value.name === 'string' && !/[a-z0-9]/i.test(value.name) ? 'Department name must include a letter or number.' : '',
  ]),
  chatDirect: makeSchema(['userId'], [(value) => typeof value.userId === 'string' && OBJECT_ID_PATTERN.test(value.userId) ? '' : 'Choose a valid colleague.']),
  chatDepartment: makeSchema(['departmentId'], [(value) => typeof value.departmentId === 'string' && OBJECT_ID_PATTERN.test(value.departmentId) ? '' : 'Choose a valid department.']),
  chatMessage: makeSchema(['body'], [(value) => textError(value.body, 'Message', { min: 1, max: 4000 })]),
  invoiceStatus: makeSchema(['status'], [(value) => ['draft', 'sent', 'paid', 'overdue', 'cancelled'].includes(value.status) ? '' : 'Choose a valid invoice status.']),
  location: makeSchema(['location'], [(value) => {
    const location = value.location
    if (!isPlainObject(location) || !Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90 || !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) return 'Provide valid GPS coordinates.'
    if (location.accuracyMeters !== undefined && location.accuracyMeters !== null && (!Number.isFinite(location.accuracyMeters) || location.accuracyMeters < 0 || location.accuracyMeters > 50000)) return 'GPS accuracy must be between 0 and 50,000 metres.'
    if (location.clientReportedAt !== undefined && (typeof location.clientReportedAt !== 'string' || Number.isNaN(Date.parse(location.clientReportedAt)))) return 'Device location time is invalid.'
    return Object.keys(location).some((key) => !['latitude', 'longitude', 'accuracyMeters', 'clientReportedAt'].includes(key)) ? 'Location contains an unexpected field.' : ''
  }]),
  checkIn: makeSchema(['location', 'exceptionReason'], [(value) => {
    if (value.location === undefined || value.location === null) return textError(value.exceptionReason, 'GPS exception reason', { min: 3, max: 1000 })
    const error = schemas.location({ location: value.location })
    return error || (value.exceptionReason === undefined ? '' : textError(value.exceptionReason, 'GPS exception reason', { required: false, max: 1000 }))
  }]),
  locationCorrection: makeSchema(['location', 'reason'], [
    (value) => schemas.location({ location: value.location }),
    (value) => textError(value.reason, 'Correction reason', { min: 3, max: 1000 }),
  ]),
  locationReview: makeSchema(['decision', 'message'], [
    (value) => ['reviewed', 'approve-correction', 'reject-correction'].includes(value.decision) ? '' : 'Choose a valid location review action.',
    (value) => textError(value.message, 'Review note', { min: 3, max: 1000 }),
  ]),
  googleSheet: makeSchema(['sheetUrl'], [(value) => {
    const message = textError(value.sheetUrl, 'Google Sheets link', { max: 2048 })
    if (message) return message
    try {
      const url = new URL(value.sheetUrl.trim())
      return url.hostname === 'docs.google.com' && url.pathname.startsWith('/spreadsheets/d/') ? '' : 'Use a valid Google Sheets link.'
    } catch { return 'Enter a valid Google Sheets link.' }
  }]),
  userImport: makeSchema(['users'], [
    (value) => Array.isArray(value.users) && value.users.length >= 1 && value.users.length <= 100 ? '' : 'Import between 1 and 100 user rows at a time.',
    (value) => Array.isArray(value.users) && value.users.some((row) => !isPlainObject(row)) ? 'Every spreadsheet row must contain an object of column values.' : '',
  ]),
}

/** Validates a client form payload before it is sent to the API. */
export function validateClientForm(schemaName, value) {
  const validate = schemas[schemaName]
  if (!validate) throw new Error(`Unknown client form validation schema: ${schemaName}`)
  return validate(value)
}

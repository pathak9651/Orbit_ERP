const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const MAX_PROFILE_IMAGE_BYTES = 1_572_864
export const MAX_DOCUMENT_UPLOAD_BYTES = 15 * 1024 * 1024
export const DOCUMENT_UPLOAD_TYPES = Object.freeze({
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
})
const errorsWithoutRepeatedUnknownFieldScan = new WeakSet()

/** Confirms an uploaded profile image is small and its declared type matches its binary signature. */
export function validateProfileImageUpload(imageBuffer, contentType) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) return 'Choose a profile image to upload.'
  if (imageBuffer.length > MAX_PROFILE_IMAGE_BYTES) return 'Profile images must be 1.5 MB or smaller.'

  const detectedType = imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff
    ? 'image/jpeg'
    : imageBuffer.length >= 8 && imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? 'image/png'
      : imageBuffer.length >= 12 && imageBuffer.toString('ascii', 0, 4) === 'RIFF' && imageBuffer.toString('ascii', 8, 12) === 'WEBP'
        ? 'image/webp'
        : ''

  if (!detectedType || detectedType !== contentType) return 'Upload a valid JPEG, PNG, or WebP image.'
  return ''
}

/** Checks document size, allowed extension/type pairs, and basic file signatures before private storage. */
export function validateDocumentUpload(fileBuffer, contentType, originalName) {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) return 'Choose a document to upload.'
  if (fileBuffer.length > MAX_DOCUMENT_UPLOAD_BYTES) return 'Documents must be 15 MB or smaller.'
  if (typeof originalName !== 'string' || !originalName.trim() || originalName.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(originalName)) {
    return 'Enter a valid document filename.'
  }

  const extension = originalName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || ''
  const expectedType = DOCUMENT_UPLOAD_TYPES[extension]
  if (!expectedType || expectedType !== contentType) return 'Choose a supported PDF, text, Word, Excel, or PowerPoint document.'

  const isPdf = extension === '.pdf' && fileBuffer.subarray(0, 5).toString('ascii') === '%PDF-'
  const isLegacyOffice = ['.doc', '.xls', '.ppt'].includes(extension)
    && fileBuffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
  const isOfficeOpenXml = ['.docx', '.xlsx', '.pptx'].includes(extension)
    && fileBuffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  let isUtf8Text = false
  if (extension === '.txt') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(fileBuffer)
      isUtf8Text = true
    } catch { /* Invalid text encodings must not be stored as plain text documents. */ }
  }

  if (!isPdf && !isLegacyOffice && !isOfficeOpenXml && !isUtf8Text) return 'The file contents do not match the selected document type.'
  return ''
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isDateKey(value) {
  return typeof value === 'string' && DATE_PATTERN.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

function checkObject(body, allowedFields, errors) {
  if (!isObject(body)) {
    errors.push('Send a JSON object with the requested form fields.')
    return false
  }
  if (!errorsWithoutRepeatedUnknownFieldScan.has(errors)) {
    const unknownFields = Object.keys(body).filter((field) => !allowedFields.includes(field))
    if (unknownFields.length) errors.push(`Unexpected field: ${unknownFields[0]}.`)
  }
  return true
}

function checkString(body, field, label, errors, { required = true, min = 0, max = Infinity, trim = true } = {}) {
  const value = body[field]
  if (value === undefined && !required) return ''
  if (value === undefined) {
    errors.push(`${label} is required.`)
    return ''
  }
  if (typeof value !== 'string') {
    errors.push(`${label} must be text.`)
    return ''
  }
  const checkedValue = trim ? value.trim() : value
  if (required && !checkedValue) errors.push(`${label} is required.`)
  else if (checkedValue.length < min) errors.push(`${label} must contain at least ${min} characters.`)
  if (checkedValue.length > max) errors.push(`${label} must contain no more than ${max} characters.`)
  return checkedValue
}

function checkEmail(body, errors) {
  const email = checkString(body, 'email', 'Email address', errors, { max: 254 })
  if (email && !EMAIL_PATTERN.test(email)) errors.push('Enter a valid email address.')
}

function checkPassword(body, field, label, errors, { required = true, min = 0 } = {}) {
  const password = checkString(body, field, label, errors, { required, min, max: 72, trim: false })
  if (password && Buffer.byteLength(password, 'utf8') > 72) errors.push(`${label} must be no more than 72 bytes.`)
}

/**
 * Creates a shallow, allowlisted request validator for route-specific inputs.
 * Keep this middleware before controllers so malformed values never reach a query.
 */
export function validate(spec, { source = 'body', rejectUnknown = true, bodySchema } = {}) {
  if (!['body', 'query', 'params'].includes(source)) {
    throw new TypeError(`Unsupported validation source: ${source}`)
  }
  if (!isObject(spec)) throw new TypeError('Validation spec must be an object.')

  const fields = Object.entries(spec).map(([name, definition]) => [
    name,
    typeof definition === 'string' ? { type: definition } : definition,
  ])

  return (req, res, next) => {
    const input = req[source]
    const errors = []
    if (!isObject(input)) {
      return res.status(400).json({ message: `Request ${source} must be an object.` })
    }

    if (rejectUnknown) {
      const allowed = new Set(fields.map(([name]) => name))
      const unknownField = Object.keys(input).find((name) => !allowed.has(name))
      if (unknownField) errors.push(`Unexpected ${source} field: ${unknownField}.`)
    }

    for (const [name, definition] of fields) {
      const value = input[name]
      const { type, required = false, enum: allowedValues, immutableForRoles } = definition || {}
      if (value === undefined) {
        if (required) errors.push(`${name} is required.`)
        continue
      }

      const validType = (value === null && definition?.nullable === true) || type === 'any' || (type === 'string' ? typeof value === 'string'
        : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
          : type === 'integer' ? (typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && /^\d+$/.test(value))
            : type === 'boolean' ? typeof value === 'boolean'
              : type === 'email' ? typeof value === 'string' && EMAIL_PATTERN.test(value)
                : type === 'objectId' ? typeof value === 'string' && OBJECT_ID_PATTERN.test(value)
                  : type === 'object' ? isObject(value)
                    : type === 'array' ? Array.isArray(value)
                      : false)

      if (!validType) {
        errors.push(`${name} has an invalid value.`)
        continue
      }
      if (Array.isArray(allowedValues) && !allowedValues.includes(value)) {
        errors.push(`${name} has an unsupported value.`)
      }
      if (Array.isArray(immutableForRoles) && !immutableForRoles.includes(req.user?.role)) {
        errors.push(`${name} cannot be changed for this account.`)
      }
    }

    if (bodySchema && source === 'body') {
      const businessErrors = validateRequestBody(bodySchema, input, { skipUnknown: true })
      errors.push(...businessErrors)
    }

    if (errors.length) {
      const status = errors.some((message) => message.includes('cannot be changed')) ? 403 : 400
      return res.status(status).json({ message: errors[0], errors })
    }
    return next()
  }
}

const bodyValidators = {
  login(body, errors) {
    if (!checkObject(body, ['email', 'password'], errors)) return
    checkEmail(body, errors)
    checkPassword(body, 'password', 'Password', errors)
  },
  forgotPassword(body, errors) {
    if (!checkObject(body, ['email'], errors)) return
    checkEmail(body, errors)
  },
  resetPassword(body, errors) {
    if (!checkObject(body, ['token', 'newPassword'], errors)) return
    checkString(body, 'token', 'Reset token', errors, { max: 200 })
    checkPassword(body, 'newPassword', 'New password', errors, { min: 8 })
  },
  signup(body, errors) {
    if (!checkObject(body, ['name', 'phone', 'email', 'dateOfBirth', 'password'], errors)) return
    checkString(body, 'name', 'Name', errors, { min: 2, max: 80 })
    const phone = checkString(body, 'phone', 'Phone number', errors, { min: 8, max: 25 })
    if (phone && !/^\+?\d{8,15}$/.test(phone.replace(/[\s().-]/g, ''))) errors.push('Enter a valid phone number with 8 to 15 digits.')
    checkEmail(body, errors)
    const dateOfBirth = checkString(body, 'dateOfBirth', 'Date of birth', errors, { max: 10 })
    if (dateOfBirth && (!isDateKey(dateOfBirth) || dateOfBirth > new Date().toISOString().slice(0, 10))) errors.push('Enter a valid date of birth that is not in the future.')
    checkPassword(body, 'password', 'Password', errors, { min: 8 })
  },
  profile(body, errors) {
    if (!checkObject(body, ['name', 'email', 'phone', 'dateOfBirth', 'currentPassword'], errors)) return
    checkString(body, 'name', 'Name', errors, { min: 2, max: 80 })
    checkEmail(body, errors)
    const phone = checkString(body, 'phone', 'Phone number', errors, { required: false, max: 25 })
    if (phone && !/^\+?\d{8,15}$/.test(phone.replace(/[\s().-]/g, ''))) errors.push('Enter a valid phone number with 8 to 15 digits.')
    const dateOfBirth = checkString(body, 'dateOfBirth', 'Date of birth', errors, { required: false, max: 10 })
    if (dateOfBirth && (!isDateKey(dateOfBirth) || dateOfBirth > new Date().toISOString().slice(0, 10))) errors.push('Enter a valid date of birth that is not in the future.')
    if (body.currentPassword !== undefined) checkPassword(body, 'currentPassword', 'Current password', errors, { required: false })
  },
  password(body, errors) {
    if (!checkObject(body, ['currentPassword', 'newPassword'], errors)) return
    checkPassword(body, 'currentPassword', 'Current password', errors)
    checkPassword(body, 'newPassword', 'New password', errors, { min: 8 })
  },
  adminUser(body, errors) {
    if (!checkObject(body, ['name', 'email', 'password', 'role', 'departmentId', 'isVerified'], errors)) return
    checkString(body, 'name', 'Name', errors, { min: 2, max: 80 })
    checkEmail(body, errors)
    checkPassword(body, 'password', 'Initial password', errors, { min: 8 })
    checkString(body, 'role', 'Role', errors, { max: 60 })
    if (body.departmentId !== undefined && body.departmentId !== null && body.departmentId !== '' && (typeof body.departmentId !== 'string' || !OBJECT_ID_PATTERN.test(body.departmentId))) errors.push('Choose a valid department.')
    if (body.isVerified !== undefined && typeof body.isVerified !== 'boolean') errors.push('Verification status must be true or false.')
  },
  adminUserUpdate(body, errors) {
    if (!checkObject(body, ['name', 'email', 'phone', 'dateOfBirth', 'role', 'departmentId', 'isVerified'], errors)) return
    if (!Object.keys(body).length) errors.push('Choose at least one user detail to update.')
    if (body.name !== undefined) checkString(body, 'name', 'Name', errors, { min: 2, max: 80 })
    if (body.email !== undefined) checkEmail(body, errors)
    if (body.phone !== undefined) {
      const phone = checkString(body, 'phone', 'Phone number', errors, { required: false, max: 25 })
      if (phone && !/^\+?\d{8,15}$/.test(phone.replace(/[\s().-]/g, ''))) errors.push('Enter a valid phone number with 8 to 15 digits.')
    }
    if (body.dateOfBirth !== undefined && body.dateOfBirth !== '' && (!isDateKey(body.dateOfBirth) || body.dateOfBirth > new Date().toISOString().slice(0, 10))) errors.push('Enter a valid date of birth that is not in the future.')
    if (body.role !== undefined && (typeof body.role !== 'string' || !body.role.trim() || body.role.length > 60)) errors.push('Choose a valid role.')
    if (body.departmentId !== undefined && body.departmentId !== null && body.departmentId !== '' && (typeof body.departmentId !== 'string' || !OBJECT_ID_PATTERN.test(body.departmentId))) errors.push('Choose a valid department.')
    if (body.isVerified !== undefined && typeof body.isVerified !== 'boolean') errors.push('Verification status must be true or false.')
  },
  impersonation(body, errors) {
    if (!checkObject(body, ['reason'], errors)) return
    checkString(body, 'reason', 'Impersonation reason', errors, { min: 10, max: 500 })
  },
  crmCustomer(body, errors) {
    if (!checkObject(body, ['name', 'company', 'email', 'phone', 'address', 'status', 'source', 'notes'], errors)) return
    checkString(body, 'name', 'Customer name', errors, { min: 2, max: 100 })
    checkString(body, 'company', 'Company', errors, { required: false, max: 120 })
    const email = checkString(body, 'email', 'Email', errors, { required: false, max: 254 })
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Enter a valid email address.')
    checkString(body, 'phone', 'Phone', errors, { required: false, max: 30 })
    checkString(body, 'address', 'Address', errors, { required: false, max: 500 })
    checkString(body, 'status', 'Status', errors, { required: false, max: 20 })
    checkString(body, 'source', 'Source', errors, { required: false, max: 80 })
    checkString(body, 'notes', 'Notes', errors, { required: false, max: 2000 })
    if (!(typeof body.email === 'string' && body.email.trim()) && !(typeof body.phone === 'string' && body.phone.trim())) errors.push('Add an email address or phone number.')
    if (body.status !== undefined && body.status !== '' && !['lead', 'prospect', 'customer', 'inactive'].includes(body.status)) errors.push('Choose a valid customer status.')
  },
  inventoryItem(body, errors) {
    if (!checkObject(body, ['name', 'category', 'sku', 'quantity', 'reorderLevel', 'unit', 'location', 'supplier', 'description'], errors)) return
    checkString(body, 'name', 'Item name', errors, { min: 2, max: 120 })
    checkString(body, 'category', 'Category', errors, { min: 2, max: 80 })
    checkString(body, 'sku', 'SKU', errors, { required: false, max: 40 })
    checkString(body, 'unit', 'Unit', errors, { min: 1, max: 30 })
    checkString(body, 'location', 'Location', errors, { required: false, max: 120 })
    checkString(body, 'supplier', 'Supplier', errors, { required: false, max: 120 })
    checkString(body, 'description', 'Description', errors, { required: false, max: 1000 })
    for (const field of ['quantity', 'reorderLevel']) {
      if (!Number.isInteger(body[field]) || body[field] < 0 || body[field] > 1000000) errors.push(`${field === 'quantity' ? 'Quantity' : 'Reorder level'} must be a whole number from 0 to 1,000,000.`)
    }
  },
  revenueTransaction(body, errors) {
    if (!checkObject(body, ['transactionType', 'category', 'amount', 'transactionDate', 'status', 'paymentMethod', 'counterparty', 'reference', 'description'], errors)) return
    if (!['income', 'expense', 'refund', 'transfer'].includes(body.transactionType)) errors.push('Choose income, expense, refund, or transfer as the transaction type.')
    checkString(body, 'category', 'Category', errors, { min: 2, max: 60 })
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0.01 || body.amount > 1000000000000 || Math.round(body.amount * 100) !== body.amount * 100) errors.push('Amount must be a positive amount in INR with no more than two decimal places.')
    const transactionDate = checkString(body, 'transactionDate', 'Transaction date', errors, { max: 10 })
    if (transactionDate && !isDateKey(transactionDate)) errors.push('Enter a valid transaction date.')
    if (!['cleared', 'pending', 'voided'].includes(body.status)) errors.push('Choose cleared, pending, or voided as the transaction status.')
    if (!['bank-transfer', 'upi', 'card', 'cash', 'cheque', 'other'].includes(body.paymentMethod)) errors.push('Choose a supported payment method.')
    checkString(body, 'counterparty', 'Customer or vendor', errors, { required: false, max: 120 })
    checkString(body, 'reference', 'Reference', errors, { required: false, max: 100 })
    checkString(body, 'description', 'Description', errors, { required: false, max: 1000 })
  },
  crmCustomerImport(body, errors) {
    if (!checkObject(body, ['customers'], errors)) return
    if (!Array.isArray(body.customers) || body.customers.length < 1 || body.customers.length > 100) errors.push('Import between 1 and 100 customers at a time.')
    else if (body.customers.some((row) => !isObject(row))) errors.push('Every spreadsheet row must contain an object of customer details.')
  },
  userImport(body, errors) {
    if (!checkObject(body, ['users'], errors)) return
    if (!Array.isArray(body.users) || body.users.length < 1 || body.users.length > 100) errors.push('Import between 1 and 100 user rows at a time.')
    else if (body.users.some((row) => !isObject(row))) errors.push('Every spreadsheet row must contain an object of column values.')
  },
  googleSheet(body, errors) {
    if (!checkObject(body, ['sheetUrl'], errors)) return
    const value = checkString(body, 'sheetUrl', 'Google Sheets link', errors, { max: 2048 })
    try {
      const url = new URL(value)
      if (url.hostname !== 'docs.google.com' || !url.pathname.startsWith('/spreadsheets/d/')) errors.push('Use a valid Google Sheets link.')
    } catch { errors.push('Enter a valid Google Sheets link.') }
  },
  task(body, errors) {
    if (!checkObject(body, ['title', 'description', 'assignedTo', 'dueDate'], errors)) return
    checkString(body, 'title', 'Task title', errors, { min: 3, max: 120 })
    checkString(body, 'description', 'Task description', errors, { required: false, max: 2000 })
    if (typeof body.assignedTo !== 'string' || !OBJECT_ID_PATTERN.test(body.assignedTo)) errors.push('Select a valid team member.')
    if (body.dueDate !== undefined && body.dueDate !== '' && !isDateKey(body.dueDate)) errors.push('Enter a valid due date.')
  },
  taskStatus(body, errors) {
    if (!checkObject(body, ['status'], errors)) return
    if (!['pending', 'in-progress', 'completed'].includes(body.status)) errors.push('Choose a valid task status.')
  },
  leave(body, errors) {
    if (!checkObject(body, ['leaveType', 'startDate', 'endDate', 'reason'], errors)) return
    if (!['annual', 'sick', 'personal', 'unpaid'].includes(body.leaveType)) errors.push('Select a valid leave type.')
    if (!isDateKey(body.startDate) || !isDateKey(body.endDate) || body.endDate < body.startDate) errors.push('Enter a valid leave date range.')
    checkString(body, 'reason', 'Reason', errors, { min: 3, max: 1000 })
  },
  leaveAction(body, errors) {
    if (!checkObject(body, ['action', 'message'], errors)) return
    if (!['forward', 'approve', 'reject'].includes(body.action)) errors.push('Choose a valid leave action.')
    checkString(body, 'message', 'Review message', errors, { required: false, max: 1000 })
    if (['forward', 'reject'].includes(body.action) && (typeof body.message !== 'string' || body.message.trim().length < 3)) errors.push('Add a suggestion or decision message before continuing.')
  },
  email(body, errors) {
    if (!checkObject(body, ['recipientIds', 'subject', 'message'], errors)) return
    if (!Array.isArray(body.recipientIds) || body.recipientIds.length < 1 || body.recipientIds.length > 200 || body.recipientIds.some((id) => typeof id !== 'string' || !OBJECT_ID_PATTERN.test(id))) errors.push('Choose between 1 and 200 valid recipients.')
    checkString(body, 'subject', 'Subject', errors, { max: 180 })
    checkString(body, 'message', 'Message', errors, { max: 20000 })
  },
  invoice(body, errors) {
    if (!checkObject(body, ['customerName', 'customerEmail', 'dueDate', 'notes', 'status', 'items'], errors)) return
    checkString(body, 'customerName', 'Customer name', errors, { min: 2, max: 120 })
    const email = checkString(body, 'customerEmail', 'Customer email', errors, { required: false, max: 254 })
    if (email && !EMAIL_PATTERN.test(email)) errors.push('Enter a valid customer email.')
    if (body.status !== undefined && body.status !== 'draft' && body.status !== 'sent') errors.push('Choose a valid initial invoice status.')
    if (body.status !== 'draft' && !email) errors.push('A customer email is required to send an invoice.')
    if (!isDateKey(body.dueDate)) errors.push('Choose a valid invoice due date.')
    checkString(body, 'notes', 'Invoice notes', errors, { required: false, max: 1000 })
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 10) errors.push('Add between 1 and 10 invoice items.')
    else body.items.forEach((item, index) => {
      if (!isObject(item)) { errors.push(`Invoice item ${index + 1} is invalid.`); return }
      if (typeof item.description !== 'string' || item.description.trim().length < 2 || item.description.trim().length > 160) errors.push(`Invoice item ${index + 1} needs a description between 2 and 160 characters.`)
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || Number(item.quantity) > 100000) errors.push(`Invoice item ${index + 1} needs a valid positive quantity.`)
      if (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0 || Number(item.unitPrice) > 100000000) errors.push(`Invoice item ${index + 1} needs a valid unit price.`)
      const unexpected = Object.keys(item).find((field) => !['description', 'quantity', 'unitPrice'].includes(field))
      if (unexpected) errors.push(`Unexpected invoice item field: ${unexpected}.`)
    })
  },
  invoiceStatus(body, errors) {
    if (!checkObject(body, ['status'], errors)) return
    if (!['draft', 'sent', 'paid', 'overdue', 'cancelled'].includes(body.status)) errors.push('Choose a valid invoice status.')
  },
  roleName(body, errors) {
    if (!checkObject(body, ['name'], errors)) return
    checkString(body, 'name', 'Role name', errors, { min: 2, max: 40 })
  },
  departmentName(body, errors) {
    if (!checkObject(body, ['name'], errors)) return
    checkString(body, 'name', 'Department name', errors, { min: 2, max: 60 })
  },
  chatDirect(body, errors) {
    if (!checkObject(body, ['userId'], errors)) return
    if (typeof body.userId !== 'string' || !OBJECT_ID_PATTERN.test(body.userId)) errors.push('Choose a valid colleague.')
  },
  chatDepartment(body, errors) {
    if (!checkObject(body, ['departmentId'], errors)) return
    if (typeof body.departmentId !== 'string' || !OBJECT_ID_PATTERN.test(body.departmentId)) errors.push('Choose a valid department.')
  },
  chatMessage(body, errors) {
    if (!checkObject(body, ['body'], errors)) return
    checkString(body, 'body', 'Message', errors, { min: 1, max: 4000 })
  },
  location(body, errors) {
    if (!checkObject(body, ['location'], errors)) return
    const location = body.location
    if (!isObject(location) || !Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90 || !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) {
      errors.push('Provide valid GPS coordinates.')
      return
    }
    if (location.accuracyMeters !== undefined && location.accuracyMeters !== null && (!Number.isFinite(location.accuracyMeters) || location.accuracyMeters < 0 || location.accuracyMeters > 50_000)) errors.push('GPS accuracy must be between 0 and 50,000 metres.')
    if (location.clientReportedAt !== undefined && (typeof location.clientReportedAt !== 'string' || Number.isNaN(Date.parse(location.clientReportedAt)))) errors.push('Device location timestamp must be a valid date.')
    if (Object.keys(location).some((field) => !['latitude', 'longitude', 'accuracyMeters', 'clientReportedAt'].includes(field))) errors.push('Location contains an unexpected field.')
  },
  checkIn(body, errors) {
    if (!checkObject(body, ['location', 'exceptionReason'], errors)) return
    if (body.location === undefined || body.location === null) {
      checkString(body, 'exceptionReason', 'GPS exception reason', errors, { min: 3, max: 1000 })
      return
    }
    bodyValidators.location({ location: body.location }, errors)
    if (body.exceptionReason !== undefined) checkString(body, 'exceptionReason', 'GPS exception reason', errors, { required: false, max: 1000 })
  },
  locationCorrection(body, errors) {
    if (!checkObject(body, ['location', 'reason'], errors)) return
    bodyValidators.location({ location: body.location }, errors)
    checkString(body, 'reason', 'Correction reason', errors, { min: 3, max: 1000 })
  },
  locationReview(body, errors) {
    if (!checkObject(body, ['decision', 'message'], errors)) return
    if (!['reviewed', 'approve-correction', 'reject-correction'].includes(body.decision)) errors.push('Choose a valid location review action.')
    checkString(body, 'message', 'Review note', errors, { min: 3, max: 1000 })
  },
  calendarEvent(body, errors) {
    if (!checkObject(body, ['title', 'description', 'type', 'startAt', 'endAt', 'allDay', 'location', 'reminderMinutes'], errors)) return
    checkString(body, 'title', 'Event title', errors, { min: 2, max: 120 })
    checkString(body, 'description', 'Event description', errors, { required: false, max: 2000 })
    checkString(body, 'location', 'Location', errors, { required: false, max: 200 })
    if (!['holiday', 'event', 'meeting'].includes(body.type)) errors.push('Choose a valid calendar event type.')
    const validTimestamp = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
    if (!validTimestamp(body.startAt) || !validTimestamp(body.endAt) || body.endAt <= body.startAt) errors.push('Enter a valid calendar date and time range.')
    if (typeof body.allDay !== 'boolean') errors.push('Choose whether this is an all-day event.')
    if (!Number.isInteger(body.reminderMinutes) || ![0, 5, 15, 30, 60, 1440].includes(body.reminderMinutes)) errors.push('Choose a valid reminder time.')
  },
}

/** Returns validation messages for one named form/request schema. */
export function validateRequestBody(schemaName, body, { skipUnknown = false } = {}) {
  const validator = bodyValidators[schemaName]
  if (!validator) throw new Error(`Unknown request validation schema: ${schemaName}`)
  const errors = []
  if (skipUnknown) errorsWithoutRepeatedUnknownFieldScan.add(errors)
  validator(body, errors)
  return errors
}


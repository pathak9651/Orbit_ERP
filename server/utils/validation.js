const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const MAX_PROFILE_IMAGE_BYTES = 1_572_864

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
  const unknownFields = Object.keys(body).filter((field) => !allowedFields.includes(field))
  if (unknownFields.length) errors.push(`Unexpected field: ${unknownFields[0]}.`)
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
export function validate(spec, { source = 'body', rejectUnknown = true } = {}) {
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

      const validType = type === 'string' ? typeof value === 'string'
        : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
          : type === 'integer' ? (typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && /^\d+$/.test(value))
            : type === 'boolean' ? typeof value === 'boolean'
              : type === 'email' ? typeof value === 'string' && EMAIL_PATTERN.test(value)
                : type === 'objectId' ? typeof value === 'string' && OBJECT_ID_PATTERN.test(value)
                  : type === 'object' ? isObject(value)
                    : type === 'array' ? Array.isArray(value)
                      : false

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
    if (!checkObject(body, ['role', 'departmentId', 'isVerified'], errors)) return
    if (!Object.keys(body).length) errors.push('Choose a role, department, or verification status to update.')
    if (body.role !== undefined && (typeof body.role !== 'string' || !body.role.trim() || body.role.length > 60)) errors.push('Choose a valid role.')
    if (body.departmentId !== undefined && body.departmentId !== null && body.departmentId !== '' && (typeof body.departmentId !== 'string' || !OBJECT_ID_PATTERN.test(body.departmentId))) errors.push('Choose a valid department.')
    if (body.isVerified !== undefined && typeof body.isVerified !== 'boolean') errors.push('Verification status must be true or false.')
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
}

/** Returns validation messages for one named form/request schema. */
export function validateRequestBody(schemaName, body) {
  const validator = bodyValidators[schemaName]
  if (!validator) throw new Error(`Unknown request validation schema: ${schemaName}`)
  const errors = []
  validator(body, errors)
  return errors
}

/** Rejects malformed or unexpected request fields before a controller can use them. */
export function validateBody(schemaName) {
  return (req, res, next) => {
    const errors = validateRequestBody(schemaName, req.body)
    if (errors.length) return res.status(400).json({ message: errors[0], errors })
    return next()
  }
}

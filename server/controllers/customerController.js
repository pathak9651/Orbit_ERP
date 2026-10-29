import Customer from '../models/customer.js'
import { recordAuditEvent } from '../services/audit.js'
import { serializeCsvRow } from '../utils/csv.js'
import { getPaginationOptions, paginateQuery } from '../utils/pagination.js'

const CUSTOMER_IMPORT_LIMIT = 100
const CUSTOMER_STATUSES = new Set(['lead', 'prospect', 'customer', 'inactive'])

/** Normalizes and validates one customer row for both single and spreadsheet creation. */
function validateCustomer(source = {}) {
  const customer = {
    name: typeof source.name === 'string' ? source.name.trim() : '',
    company: typeof source.company === 'string' ? source.company.trim() : '',
    email: typeof source.email === 'string' ? source.email.trim().toLowerCase() : '',
    phone: typeof source.phone === 'string' ? source.phone.trim() : '',
    address: typeof source.address === 'string' ? source.address.trim() : '',
    status: typeof source.status === 'string' && source.status.trim() ? source.status.trim().toLowerCase() : 'lead',
    source: typeof source.source === 'string' ? source.source.trim() : '',
    notes: typeof source.notes === 'string' ? source.notes.trim() : '',
  }
  const issues = []
  if (customer.name.length < 2 || customer.name.length > 100) issues.push('Name must be between 2 and 100 characters.')
  if (customer.company.length > 120) issues.push('Company must be 120 characters or fewer.')
  if (customer.email && (customer.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))) issues.push('Enter a valid email address.')
  if (customer.phone.length > 30) issues.push('Phone must be 30 characters or fewer.')
  if (!customer.email && !customer.phone) issues.push('Add an email address or phone number.')
  if (customer.address.length > 500 || customer.source.length > 80 || customer.notes.length > 2000) issues.push('Address, source, or notes exceed the allowed length.')
  if (!CUSTOMER_STATUSES.has(customer.status)) issues.push('Choose a valid customer status: lead, prospect, customer, or inactive.')
  return { customer, issues }
}

/** Returns a paginated customer list, optionally filtered by search and CRM status. */
export async function listCustomers(req, res, next) {
  try {
    const filter = {}
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : ''
    if (status && !CUSTOMER_STATUSES.has(status)) return res.status(400).json({ message: 'Choose a valid customer status filter.' })
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = ['name', 'company', 'email', 'phone'].map((field) => ({ [field]: new RegExp(safeSearch, 'i') }))
    }
    if (status) filter.status = status
    const page = await paginateQuery(Customer.find(filter).populate('createdBy', 'name').sort({ createdAt: -1 }).lean(), Customer.countDocuments(filter), getPaginationOptions(req.query))
    return res.json({ customers: page.items.map(({ createdBy, ...customer }) => ({ ...customer, id: String(customer._id), createdBy: createdBy?.name || '' })), pagination: page.pagination })
  } catch (error) { return next(error) }
}

/** Creates a single CRM customer and adds an audit event for the admin action. */
export async function createCustomer(req, res, next) {
  const { customer, issues } = validateCustomer(req.body)
  if (issues.length) return res.status(400).json({ message: issues.join(' ') })
  try {
    const record = await Customer.create({ ...customer, createdBy: req.user._id })
    await recordAuditEvent(req, { eventType: 'customer_created', details: { customerId: String(record._id) } })
    return res.status(201).json({ customer: { ...record.toObject(), id: String(record._id), createdBy: req.user.name } })
  } catch (error) { return next(error) }
}

/** Updates a CRM record after applying the same field validation used during creation. */
export async function updateCustomer(req, res, next) {
  const { customer, issues } = validateCustomer(req.body)
  if (issues.length) return res.status(400).json({ message: issues.join(' ') })
  try {
    const record = await Customer.findById(req.params.id)
    if (!record) return res.status(404).json({ message: 'Customer not found.' })
    record.set(customer)
    await record.save()
    await recordAuditEvent(req, { eventType: 'customer_updated', details: { customerId: String(record._id) } })
    return res.json({ customer: { ...record.toObject(), id: String(record._id) } })
  } catch (error) { return next(error) }
}

/** Deletes a CRM customer record and logs the affected record identifier. */
export async function deleteCustomer(req, res, next) {
  try {
    const record = await Customer.findByIdAndDelete(req.params.id)
    if (!record) return res.status(404).json({ message: 'Customer not found.' })
    await recordAuditEvent(req, { eventType: 'customer_deleted', details: { customerId: String(record._id) } })
    return res.json({ message: 'Customer deleted.' })
  } catch (error) { return next(error) }
}

/** Imports up to 100 customer records and returns clear per-row validation issues. */
export async function importCustomers(req, res, next) {
  const rows = Array.isArray(req.body?.customers) ? req.body.customers : []
  if (!rows.length || rows.length > CUSTOMER_IMPORT_LIMIT) return res.status(400).json({ message: `Import between 1 and ${CUSTOMER_IMPORT_LIMIT} customers at a time.` })
  const createdCustomers = []
  const rowErrors = []
  try {
    for (const [index, row] of rows.entries()) {
      const { customer, issues } = validateCustomer(row)
      if (issues.length) {
        rowErrors.push({ row: index + 2, message: issues.join(' ') })
        continue
      }
      const record = await Customer.create({ ...customer, createdBy: req.user._id })
      createdCustomers.push({ ...record.toObject(), id: String(record._id), createdBy: req.user.name })
    }
    if (createdCustomers.length) await recordAuditEvent(req, { eventType: 'customers_imported', details: { recordCount: createdCustomers.length } })
    return res.json({ createdCustomers, createdCount: createdCustomers.length, failedCount: rowErrors.length, rowErrors })
  } catch (error) { return next(error) }
}

/** Exports CRM records to a formula-safe CSV and records the export in the audit log. */
export async function exportCustomers(req, res, next) {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 }).lean()
    const rows = [serializeCsvRow(['Name', 'Company', 'Email', 'Phone', 'Address', 'Status', 'Source', 'Notes', 'Created At'])]
    for (const customer of customers) rows.push(serializeCsvRow([customer.name, customer.company, customer.email, customer.phone, customer.address, customer.status, customer.source, customer.notes, customer.createdAt?.toISOString?.() || '']))
    await recordAuditEvent(req, { eventType: 'data_exported', details: { reason: 'customer_csv_export', recordCount: customers.length } })
    res.type('text/csv; charset=utf-8')
    res.attachment(`orbit-crm-customers-${new Date().toISOString().slice(0, 10)}.csv`)
    return res.send(`\uFEFF${rows.join('')}`)
  } catch (error) { return next(error) }
}

export { validateCustomer }

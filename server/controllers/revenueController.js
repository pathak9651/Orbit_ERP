import RevenueTransaction from '../models/revenueTransaction.js'
import Invoice from '../models/invoice.js'
import { getReportPeriod } from './adminReportsController.js'
import { recordAuditEvent } from '../services/audit.js'
import { getPaginationOptions, paginateQuery } from '../utils/pagination.js'
import { serializeCsvRow } from '../utils/csv.js'

const TRANSACTION_TYPES = new Set(['income', 'expense', 'refund', 'transfer'])
const TRANSACTION_STATUSES = new Set(['cleared', 'pending', 'voided'])
const PAYMENT_METHODS = new Set(['bank-transfer', 'upi', 'card', 'cash', 'cheque', 'other'])
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Validates and normalizes finance ledger input before saving or updating it. */
export function validateRevenueTransaction(source = {}) {
  const transaction = {
    transactionType: typeof source.transactionType === 'string' ? source.transactionType.trim().toLowerCase() : '',
    category: typeof source.category === 'string' ? source.category.trim() : '',
    amount: source.amount,
    transactionDate: typeof source.transactionDate === 'string' ? source.transactionDate.trim() : '',
    status: typeof source.status === 'string' ? source.status.trim().toLowerCase() : 'cleared',
    paymentMethod: typeof source.paymentMethod === 'string' ? source.paymentMethod.trim().toLowerCase() : 'bank-transfer',
    counterparty: typeof source.counterparty === 'string' ? source.counterparty.trim() : '',
    reference: typeof source.reference === 'string' ? source.reference.trim() : '',
    description: typeof source.description === 'string' ? source.description.trim() : '',
  }
  const issues = []
  if (!TRANSACTION_TYPES.has(transaction.transactionType)) issues.push('Choose income, expense, refund, or transfer as the transaction type.')
  if (transaction.category.length < 2 || transaction.category.length > 60) issues.push('Category must be between 2 and 60 characters.')
  if (typeof transaction.amount !== 'number' || !Number.isFinite(transaction.amount) || transaction.amount <= 0 || transaction.amount > 1000000000000 || Math.round(transaction.amount * 100) !== transaction.amount * 100) issues.push('Amount must be a positive INR amount with no more than two decimal places.')
  if (!DATE_KEY_PATTERN.test(transaction.transactionDate) || Number.isNaN(Date.parse(`${transaction.transactionDate}T00:00:00.000Z`)) || new Date(`${transaction.transactionDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== transaction.transactionDate) issues.push('Enter a valid transaction date.')
  if (!TRANSACTION_STATUSES.has(transaction.status)) issues.push('Choose cleared, pending, or voided as the transaction status.')
  if (!PAYMENT_METHODS.has(transaction.paymentMethod)) issues.push('Choose a supported payment method.')
  if (transaction.counterparty.length > 120 || transaction.reference.length > 100 || transaction.description.length > 1000) issues.push('Counterparty, reference, or description exceeds its allowed length.')
  return { transaction, issues }
}

/** Builds compact, human-readable transaction data for API responses. */
function publicTransaction(record) {
  return { ...record, id: String(record._id), transactionDate: new Date(record.transactionDate).toISOString().slice(0, 10) }
}

/** Returns a server-paginated ledger and finance totals from cleared transactions in the selected period. */
export async function listRevenue(req, res, next) {
  const periodName = typeof req.query.period === 'string' ? req.query.period : 'monthly'
  const asOfDate = typeof req.query.asOfDate === 'string' ? req.query.asOfDate : new Date().toISOString().slice(0, 10)
    if (!DATE_KEY_PATTERN.test(asOfDate) || asOfDate > new Date().toISOString().slice(0, 10)) return res.status(400).json({ message: 'Choose a valid report date that is not in the future.' })
  let period
  try { period = getReportPeriod(periodName, asOfDate, 'UTC') }
  catch (error) { return res.status(400).json({ message: error.message }) }

  const dateFilter = { transactionDate: { $gte: period.startAt, $lt: period.endAtExclusive } }
  const listFilter = { ...dateFilter }
  const transactionType = typeof req.query.transactionType === 'string' ? req.query.transactionType : 'all'
  const status = typeof req.query.status === 'string' ? req.query.status : 'all'
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  if (transactionType !== 'all') {
    if (!TRANSACTION_TYPES.has(transactionType)) return res.status(400).json({ message: 'Choose a valid transaction type filter.' })
    listFilter.transactionType = transactionType
  }
  if (status !== 'all') {
    if (!TRANSACTION_STATUSES.has(status)) return res.status(400).json({ message: 'Choose a valid transaction status filter.' })
    listFilter.status = status
  }
  if (search) {
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    listFilter.$or = ['category', 'counterparty', 'reference', 'description'].map((field) => ({ [field]: new RegExp(safeSearch, 'i') }))
  }

  try {
    const [transactionPage, summaryRows, trendRows, categoryRows, invoiceRows] = await Promise.all([
      paginateQuery(RevenueTransaction.find(listFilter).sort({ transactionDate: -1, createdAt: -1 }).lean(), RevenueTransaction.countDocuments(listFilter), getPaginationOptions(req.query)),
      RevenueTransaction.aggregate([{ $match: dateFilter }, { $group: { _id: { transactionType: '$transactionType', status: '$status' }, count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
      RevenueTransaction.aggregate([
        { $match: dateFilter },
        { $group: { _id: { date: { $dateTrunc: { date: '$transactionDate', unit: period.bucketUnit, timezone: 'UTC' } }, type: '$transactionType', status: '$status' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $project: { _id: { date: { $dateToString: { date: '$_id.date', format: '%Y-%m-%d', timezone: 'UTC' } }, type: '$_id.type', status: '$_id.status' }, amount: 1, count: 1 } },
      ]),
      RevenueTransaction.aggregate([{ $match: { ...dateFilter, status: 'cleared' } }, { $group: { _id: { transactionType: '$transactionType', category: '$category' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }]),
      Invoice.aggregate([{ $match: { createdAt: { $gte: period.startAt, $lt: period.endAtExclusive } } }, { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } }]),
    ])

    const totals = { income: 0, expense: 0, refund: 0, transfer: 0, pending: 0, voided: 0, clearedCount: 0, pendingCount: 0 }
    for (const row of summaryRows) {
      if (row._id.status === 'cleared') {
        totals[row._id.transactionType] += row.amount
        totals.clearedCount += row.count
      } else {
        totals[row._id.status] += row.amount
        if (row._id.status === 'pending') totals.pendingCount += row.count
      }
    }
    const totalsByStatus = Object.fromEntries(summaryRows.map((row) => [`${row._id.transactionType}:${row._id.status}`, { count: row.count, amount: row.amount }]))
    const dateKeys = []
    for (let offset = 0; offset < period.bucketCount; offset += 1) {
      let dateKey
      if (period.period === 'weekly' || period.period === 'monthly') {
        const date = new Date(`${period.startDate}T12:00:00.000Z`)
        date.setUTCDate(date.getUTCDate() + offset)
        dateKey = date.toISOString().slice(0, 10)
      } else if (period.period === 'quarterly') {
        dateKey = new Date(Date.UTC(Number(period.startDate.slice(0, 4)), Number(period.startDate.slice(5, 7)) - 1 + offset, 1, 12)).toISOString().slice(0, 10)
      } else {
        dateKey = `${period.startDate.slice(0, 4)}-${String(offset + 1).padStart(2, '0')}-01`
      }
      dateKeys.push(dateKey)
    }
    const trends = dateKeys.map((dateKey, index) => {
      const values = { income: 0, expense: 0, refund: 0, transfer: 0 }
      for (const row of trendRows) {
        if (row._id.status === 'cleared' && row._id.date === dateKey) values[row._id.type] += row.amount
      }
      return { dateKey, label: period.period === 'weekly' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index] : period.period === 'monthly' ? String(index + 1) : period.period === 'quarterly' ? new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${dateKey}T12:00:00Z`)) : new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${dateKey}T12:00:00Z`)), ...values }
    })
    const invoiceStatus = Object.fromEntries(invoiceRows.map((row) => [row._id, { count: row.count, total: row.total }]))
    const categoryBreakdown = categoryRows.map((row) => ({ transactionType: row._id.transactionType, category: row._id.category, amount: row.amount, count: row.count }))

    return res.json({
      period: { name: period.period, startDate: period.startDate, endDate: period.endDate, timeZone: 'UTC' },
      summary: { ...totals, netEarnings: totals.income - totals.expense - totals.refund, expenditure: totals.expense + totals.refund, totalsByStatus },
      trends,
      categories: categoryBreakdown,
      invoiceStatus: { paid: invoiceStatus.paid || { count: 0, total: 0 }, sent: invoiceStatus.sent || { count: 0, total: 0 }, overdue: invoiceStatus.overdue || { count: 0, total: 0 }, draft: invoiceStatus.draft || { count: 0, total: 0 }, paymentRecordsTracked: false },
      transactions: transactionPage.items.map(publicTransaction),
      pagination: transactionPage.pagination,
    })
  } catch (error) { return next(error) }
}

/** Creates an income, expense, refund, or transfer entry and writes its audit event. */
export async function createRevenueTransaction(req, res, next) {
  const { transaction, issues } = validateRevenueTransaction(req.body)
  if (issues.length) return res.status(400).json({ message: issues.join(' ') })
  try {
    const record = await RevenueTransaction.create({ ...transaction, transactionDate: new Date(`${transaction.transactionDate}T00:00:00.000Z`), createdBy: req.user._id, updatedBy: req.user._id })
    await recordAuditEvent(req, { eventType: 'revenue_transaction_created', details: { revenueTransactionId: String(record._id), transactionType: record.transactionType, amount: record.amount, status: record.status } })
    return res.status(201).json({ transaction: publicTransaction(record.toObject()) })
  } catch (error) { return next(error) }
}

/** Updates an admin-entered finance ledger record without changing its original creator. */
export async function updateRevenueTransaction(req, res, next) {
  const { transaction, issues } = validateRevenueTransaction(req.body)
  if (issues.length) return res.status(400).json({ message: issues.join(' ') })
  try {
    const record = await RevenueTransaction.findById(req.params.id)
    if (!record) return res.status(404).json({ message: 'Revenue transaction not found.' })
    record.set({ ...transaction, transactionDate: new Date(`${transaction.transactionDate}T00:00:00.000Z`), updatedBy: req.user._id })
    await record.save()
    await recordAuditEvent(req, { eventType: 'revenue_transaction_updated', details: { revenueTransactionId: String(record._id), transactionType: record.transactionType, amount: record.amount, status: record.status } })
    return res.json({ transaction: publicTransaction(record.toObject()) })
  } catch (error) { return next(error) }
}

/** Deletes a finance ledger record and preserves its identifier in the security audit trail. */
export async function deleteRevenueTransaction(req, res, next) {
  try {
    const record = await RevenueTransaction.findByIdAndDelete(req.params.id)
    if (!record) return res.status(404).json({ message: 'Revenue transaction not found.' })
    await recordAuditEvent(req, { eventType: 'revenue_transaction_deleted', details: { revenueTransactionId: String(record._id), transactionType: record.transactionType, amount: record.amount, status: record.status } })
    return res.json({ message: 'Revenue transaction deleted.' })
  } catch (error) { return next(error) }
}

/** Exports a bounded-by-rate-limit, date-scoped finance ledger as formula-safe CSV. */
export async function exportRevenueCsv(req, res, next) {
  const periodName = typeof req.query.period === 'string' ? req.query.period : 'monthly'
  const asOfDate = typeof req.query.asOfDate === 'string' ? req.query.asOfDate : new Date().toISOString().slice(0, 10)
  if (!DATE_KEY_PATTERN.test(asOfDate) || asOfDate > new Date().toISOString().slice(0, 10)) return res.status(400).json({ message: 'Choose a valid report date that is not in the future.' })
  let period
  try { period = getReportPeriod(periodName, asOfDate, 'UTC') }
  catch (error) { return res.status(400).json({ message: error.message }) }
  try {
    const records = await RevenueTransaction.find({ transactionDate: { $gte: period.startAt, $lt: period.endAtExclusive } }).sort({ transactionDate: -1 }).lean()
    const csv = [
      ['date', 'transaction_type', 'category', 'status', 'amount_inr', 'payment_method', 'counterparty', 'reference', 'description'],
      ...records.map((record) => [record.transactionDate.toISOString().slice(0, 10), record.transactionType, record.category, record.status, record.amount, record.paymentMethod, record.counterparty, record.reference, record.description]),
    ].map(serializeCsvRow).join('')
    res.setHeader('Cache-Control', 'no-store')
    res.type('text/csv; charset=utf-8')
    res.attachment(`orbit-revenue-${period.startDate}-to-${period.endDate}.csv`)
    return res.send(`\uFEFF${csv}`)
  } catch (error) { return next(error) }
}

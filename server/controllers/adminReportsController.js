import Attendance from '../models/attendance.js'
import AuditEvent from '../models/auditEvent.js'
import CalendarEvent from '../models/calendarEvent.js'
import ChatMessage from '../models/chatMessage.js'
import ChatConversation from '../models/chatConversation.js'
import Customer from '../models/customer.js'
import Document from '../models/document.js'
import EmailLog from '../models/emailLog.js'
import InventoryItem from '../models/inventoryItem.js'
import Invoice from '../models/invoice.js'
import LeaveRequest from '../models/leaveRequest.js'
import Notification from '../models/notification.js'
import Role from '../models/role.js'
import Department from '../models/department.js'
import RevenueTransaction from '../models/revenueTransaction.js'
import Task from '../models/task.js'
import User from '../models/user.js'

const REPORT_PERIODS = new Set(['weekly', 'monthly', 'quarterly', 'yearly'])
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Returns the current business date in the configured company timezone. */
function getDateKeyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

/** Validates an ISO calendar date before it is used to scope report queries. */
function isValidDateKey(value) {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

/** Converts local midnight into UTC so report date filters follow the company timezone. */
function localMidnightAsUtc(dateKey, timeZone) {
  const utcGuess = new Date(`${dateKey}T00:00:00.000Z`)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(utcGuess)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]))
  const localViewAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second)
  return new Date(utcGuess.getTime() - (localViewAsUtc - utcGuess.getTime()))
}

/** Adds calendar days at UTC noon to avoid daylight-saving boundary surprises. */
function shiftDateKey(dateKey, dayCount) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + dayCount)
  return date.toISOString().slice(0, 10)
}

/** Creates the exact reporting bounds and chart buckets for a selected period. */
export function getReportPeriod(period, asOfDate, timeZone = 'UTC') {
  if (!REPORT_PERIODS.has(period)) throw new TypeError('Choose weekly, monthly, quarterly, or yearly reports.')
  if (!isValidDateKey(asOfDate)) throw new TypeError('Choose a valid report date.')
  const year = Number(asOfDate.slice(0, 4))
  const month = Number(asOfDate.slice(5, 7))
  let startDate
  let endDate
  let bucketUnit

  if (period === 'weekly') {
    const day = new Date(`${asOfDate}T12:00:00.000Z`).getUTCDay()
    startDate = shiftDateKey(asOfDate, -((day + 6) % 7))
    endDate = shiftDateKey(startDate, 6)
    bucketUnit = 'day'
  } else if (period === 'monthly') {
    startDate = `${asOfDate.slice(0, 7)}-01`
    endDate = new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10)
    bucketUnit = 'day'
  } else if (period === 'quarterly') {
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3
    startDate = new Date(Date.UTC(year, quarterStartMonth, 1, 12)).toISOString().slice(0, 10)
    endDate = new Date(Date.UTC(year, quarterStartMonth + 3, 0, 12)).toISOString().slice(0, 10)
    bucketUnit = 'month'
  } else {
    startDate = `${year}-01-01`
    endDate = `${year}-12-31`
    bucketUnit = 'month'
  }

  const startAt = localMidnightAsUtc(startDate, timeZone)
  const endAtExclusive = localMidnightAsUtc(shiftDateKey(endDate, 1), timeZone)
  const bucketCount = period === 'weekly' ? 7 : period === 'monthly' ? Number(endDate.slice(8, 10)) : period === 'quarterly' ? 3 : 12
  return { period, asOfDate, startDate, endDate, startAt, endAtExclusive, bucketUnit, bucketCount, timeZone }
}

/** Builds empty dates for a report trend so missing activity appears as zero. */
function makeBuckets(reportPeriod) {
  const buckets = []
  const { period, startDate, bucketCount, timeZone } = reportPeriod
  for (let index = 0; index < bucketCount; index += 1) {
    let dateKey
    if (period === 'weekly' || period === 'monthly') dateKey = shiftDateKey(startDate, index)
    else if (period === 'quarterly') dateKey = new Date(Date.UTC(Number(startDate.slice(0, 4)), Number(startDate.slice(5, 7)) - 1 + index, 1, 12)).toISOString().slice(0, 10)
    else dateKey = `${startDate.slice(0, 4)}-${String(index + 1).padStart(2, '0')}-01`
    const date = new Date(`${dateKey}T12:00:00.000Z`)
    const label = period === 'weekly'
      ? new Intl.DateTimeFormat('en', { weekday: 'short', timeZone }).format(date)
      : period === 'monthly'
        ? String(index + 1)
        : period === 'quarterly'
          ? new Intl.DateTimeFormat('en', { month: 'long', timeZone }).format(date)
          : new Intl.DateTimeFormat('en', { month: 'short', timeZone }).format(date)
    buckets.push({ dateKey, label })
  }
  return buckets
}

/** Groups timestamped records into the selected chart interval using MongoDB aggregation. */
async function aggregateByPeriod(Model, dateField, reportPeriod, extraMatch = {}) {
  const datePath = `$${dateField}`
  const match = dateField === 'dateKey'
    ? { ...extraMatch, dateKey: { $gte: reportPeriod.startDate, $lte: reportPeriod.endDate } }
    : { ...extraMatch, [dateField]: { $gte: reportPeriod.startAt, $lt: reportPeriod.endAtExclusive } }
  const dateExpression = dateField === 'dateKey' ? { $dateFromString: { dateString: datePath } } : datePath
  const pipeline = [
    { $match: match },
    { $group: { _id: { $dateTrunc: { date: dateExpression, unit: reportPeriod.bucketUnit, timezone: reportPeriod.timeZone, ...(reportPeriod.bucketUnit === 'week' ? { startOfWeek: 'monday' } : {}) } }, count: { $sum: 1 } } },
    { $project: { _id: { $dateToString: { date: '$_id', format: '%Y-%m-%d', timezone: reportPeriod.timeZone } }, count: 1 } },
  ]
  return Model.aggregate(pipeline)
}

/** Produces actual company collection counts, status summaries, and selected-period chart data. */
export async function getAdminReports(req, res, next) {
  const period = typeof req.query.period === 'string' ? req.query.period : 'monthly'
  const timeZone = process.env.APP_TIME_ZONE || 'Asia/Kolkata'
  const asOfDate = typeof req.query.asOfDate === 'string' ? req.query.asOfDate : getDateKeyInTimeZone(new Date(), timeZone)
  const today = getDateKeyInTimeZone(new Date(), timeZone)
  if (isValidDateKey(asOfDate) && asOfDate > today) return res.status(400).json({ message: 'Report date cannot be in the future.' })
  let reportPeriod
  try { reportPeriod = getReportPeriod(period, asOfDate, timeZone) }
  catch (error) { return res.status(400).json({ message: error.message }) }

  try {
    const models = [User, Task, Attendance, LeaveRequest, Invoice, RevenueTransaction, Customer, InventoryItem, Document, EmailLog, ChatMessage, ChatConversation, CalendarEvent, Notification, AuditEvent, Role, Department]
    const [collectionCounts, usersByRole, userApprovalCounts, taskStatuses, leaveStatuses, invoiceStatuses, inventoryCounts, trendResults] = await Promise.all([
      Promise.all(models.map(async (Model) => ({ collection: Model.modelName, total: await Model.countDocuments() }))),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]),
      User.aggregate([{ $group: { _id: '$isVerified', count: { $sum: 1 } } }]),
      Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      LeaveRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } }]),
      Promise.all([
        InventoryItem.countDocuments(),
        InventoryItem.countDocuments({ $expr: { $and: [{ $gt: ['$quantity', 0] }, { $lte: ['$quantity', '$reorderLevel'] }] } }),
        InventoryItem.countDocuments({ quantity: 0 }),
      ]),
      Promise.all([
        aggregateByPeriod(User, 'createdAt', reportPeriod, { role: { $ne: 'admin' } }),
        aggregateByPeriod(Task, 'createdAt', reportPeriod),
        aggregateByPeriod(Attendance, 'dateKey', reportPeriod),
        aggregateByPeriod(LeaveRequest, 'createdAt', reportPeriod),
        aggregateByPeriod(Invoice, 'createdAt', reportPeriod),
        aggregateByPeriod(RevenueTransaction, 'createdAt', reportPeriod),
        aggregateByPeriod(Customer, 'createdAt', reportPeriod),
        aggregateByPeriod(InventoryItem, 'createdAt', reportPeriod),
        aggregateByPeriod(Document, 'createdAt', reportPeriod),
        aggregateByPeriod(EmailLog, 'sentAt', reportPeriod),
        aggregateByPeriod(ChatMessage, 'createdAt', reportPeriod),
        aggregateByPeriod(ChatConversation, 'createdAt', reportPeriod),
        aggregateByPeriod(CalendarEvent, 'createdAt', reportPeriod),
        aggregateByPeriod(Notification, 'createdAt', reportPeriod),
        aggregateByPeriod(AuditEvent, 'createdAt', reportPeriod),
      ]),
    ])

    const buckets = makeBuckets(reportPeriod)
    const seriesNames = ['Employees added', 'Tasks created', 'Attendance check-ins', 'Leave requests', 'Invoices created', 'Finance transactions recorded', 'Customers added', 'Inventory items added', 'Documents uploaded', 'Emails sent', 'Chat messages', 'Chat conversations opened', 'Calendar events added', 'Notifications', 'Audit events']
    const trends = Object.fromEntries(seriesNames.map((name, index) => {
      const counts = new Map(trendResults[index].map((entry) => [new Date(entry._id).toISOString().slice(0, 10), entry.count]))
      const values = buckets.map((bucket) => ({ ...bucket, count: counts.get(bucket.dateKey) || 0 }))
      return [name, values]
    }))
    const countFor = (items, key) => items.find((item) => item._id === key)?.count || 0
    const invoiceTotal = (status) => invoiceStatuses.find((item) => item._id === status)?.total || 0
    const invoiceCount = (status) => invoiceStatuses.find((item) => item._id === status)?.count || 0

    return res.json({
      period: { name: period, asOfDate, startDate: reportPeriod.startDate, endDate: reportPeriod.endDate, timeZone },
      collections: collectionCounts,
      workforce: { totalEmployees: await User.countDocuments({ role: { $ne: 'admin' } }), activeEmployees: await User.countDocuments({ role: { $ne: 'admin' }, isVerified: { $ne: false } }), pendingApprovals: countFor(userApprovalCounts, false), byRole: usersByRole.map(({ _id, count }) => ({ role: _id, count })) },
      tasks: { total: taskStatuses.reduce((sum, item) => sum + item.count, 0), pending: countFor(taskStatuses, 'pending'), inProgress: countFor(taskStatuses, 'in-progress'), completed: countFor(taskStatuses, 'completed') },
      leaves: { total: leaveStatuses.reduce((sum, item) => sum + item.count, 0), pending: countFor(leaveStatuses, 'pending'), approved: countFor(leaveStatuses, 'approved'), rejected: countFor(leaveStatuses, 'rejected') },
      invoices: { total: invoiceStatuses.reduce((sum, item) => sum + item.count, 0), draft: invoiceCount('draft'), sent: invoiceCount('sent'), paid: invoiceCount('paid'), overdue: invoiceCount('overdue'), cancelled: invoiceCount('cancelled'), paidInvoiceTotal: invoiceTotal('paid'), unpaidInvoiceTotal: invoiceTotal('sent') + invoiceTotal('overdue'), currency: 'INR', paymentRecordsTracked: false },
      inventory: { total: inventoryCounts[0], lowStock: inventoryCounts[1], outOfStock: inventoryCounts[2] },
      trends,
    })
  } catch (error) { return next(error) }
}

/** Exposes valid report periods to tests without leaking query implementation details. */
export const supportedReportPeriods = [...REPORT_PERIODS]
export const isValidReportDate = isValidDateKey

import mongoose from 'mongoose'
import Attendance from '../models/attendance.js'
import AuditEvent from '../models/auditEvent.js'
import Department from '../models/department.js'
import Invoice from '../models/invoice.js'
import LeaveRequest from '../models/leaveRequest.js'
import Task from '../models/task.js'
import User from '../models/user.js'
import { calculateDistanceMeters, getAttendanceLocationPolicy } from '../services/attendanceLocation.js'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_LATE_AFTER = '09:30'

/** Confirms a calendar date key round-trips before using it in a database filter. */
function isValidDateKey(value) {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

/** Returns a calendar date in the configured workplace timezone. */
function dateKeyInTimeZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  return `${values.year}-${values.month}-${values.day}`
}

/** Converts workplace-local midnight to UTC so report date boundaries include the full local day. */
function localMidnightAsUtc(dateKey, timeZone) {
  const utcGuess = new Date(`${dateKey}T00:00:00.000Z`)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(utcGuess)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]))
  const timezoneViewAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second)
  return new Date(utcGuess.getTime() - (timezoneViewAsUtc - utcGuess.getTime()))
}

/** Returns the calendar key immediately following a validated date. */
function nextDateKey(dateKey) {
  const nextDate = new Date(`${dateKey}T12:00:00.000Z`)
  nextDate.setUTCDate(nextDate.getUTCDate() + 1)
  return nextDate.toISOString().slice(0, 10)
}

/** Counts weekdays in a selected range; no public-holiday calendar is configured yet. */
function getWeekdays(startDate, endDate) {
  const days = []
  const cursor = new Date(`${startDate}T12:00:00.000Z`)
  const end = new Date(`${endDate}T12:00:00.000Z`)
  while (cursor <= end) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

/** Checks whether a stored check-in belongs to the selected GPS/geofence filter. */
function matchesLocationFilter(record, locationFilter, site) {
  if (locationFilter === 'all') return true
  if (locationFilter === 'gps-unavailable') return !record.checkInLocation
  if (!record.checkInLocation) return false
  if (locationFilter === 'gps-recorded') return true
  if (!site) return false
  const isWithinSite = calculateDistanceMeters(record.checkInLocation, site) <= site.radiusMeters
  return locationFilter === 'inside-site' ? isWithinSite : !isWithinSite
}

/** Determines whether a check-in occurred after the configured workplace start time. */
function isLateCheckIn(checkIn, timeZone, lateAfter) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(checkIn)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.hour}:${values.minute}` > lateAfter
}

/** Returns real company metrics for administrators, scoped by department and reporting period. */
export async function getAdminOverview(req, res, next) {
  const timeZone = process.env.APP_TIME_ZONE || 'Asia/Kolkata'
  const today = dateKeyInTimeZone(new Date(), timeZone)
  const defaultStart = `${today.slice(0, 7)}-01`
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : defaultStart
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : today
  const startTime = localMidnightAsUtc(startDate, timeZone)
  const endTimeExclusive = localMidnightAsUtc(nextDateKey(endDate), timeZone)
  const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : 'all'
  const locationFilter = typeof req.query.location === 'string' ? req.query.location : 'all'
  const locationFilters = ['all', 'gps-recorded', 'gps-unavailable', 'inside-site', 'outside-site']

  if (!isValidDateKey(startDate) || !isValidDateKey(endDate) || startDate > endDate) {
    return res.status(400).json({ message: 'Choose a valid start and end date.' })
  }
  if (endDate > today) return res.status(400).json({ message: 'The reporting end date cannot be in the future.' })
  if ((new Date(`${endDate}T00:00:00.000Z`) - new Date(`${startDate}T00:00:00.000Z`)) / 86_400_000 > 365) {
    return res.status(400).json({ message: 'Choose a date range of 366 days or fewer.' })
  }
  if (departmentId !== 'all' && !mongoose.isValidObjectId(departmentId)) {
    return res.status(400).json({ message: 'Choose a valid department.' })
  }
  if (!locationFilters.includes(locationFilter)) return res.status(400).json({ message: 'Choose a valid attendance location filter.' })

  const { site } = getAttendanceLocationPolicy()
  if (['inside-site', 'outside-site'].includes(locationFilter) && !site) {
    return res.status(400).json({ message: 'Configure the workplace GPS site before filtering attendance by geofence.' })
  }

  try {
    const department = departmentId === 'all' ? null : await Department.findById(departmentId).select('_id name').lean()
    if (departmentId !== 'all' && !department) return res.status(400).json({ message: 'The selected department no longer exists.' })

    const departmentUserFilter = department ? { department: department._id } : {}
    const people = await User.find(departmentUserFilter).select('name role department isVerified createdAt').lean()
    const departmentUserIds = people.map((person) => person._id)
    const [departments, attendanceRecords, approvedLeaves, pendingLeaves, tasks, invoices, recentActivities] = await Promise.all([
      Department.find().select('_id name').sort({ name: 1 }).lean(),
      Attendance.find({ dateKey: { $gte: startDate, $lte: endDate } }).select('user dateKey checkIn checkInLocation').lean(),
      LeaveRequest.find({ status: 'approved', startDate: { $lte: endDate }, endDate: { $gte: startDate }, ...(department ? { department: department._id } : {}) }).select('requester startDate endDate').lean(),
      LeaveRequest.countDocuments({ status: 'pending', ...(department ? { department: department._id } : {}) }),
      Task.find({ ...(department ? { department: department._id } : {}), $or: [
        { createdAt: { $gte: startTime, $lt: endTimeExclusive } },
        { status: { $ne: 'completed' }, dueDate: { $lt: new Date() } },
      ] }).select('title status dueDate department createdAt').populate('department', 'name').lean(),
      Invoice.find({ createdAt: { $gte: startTime, $lt: endTimeExclusive }, ...(department ? { createdBy: { $in: departmentUserIds } } : {}) }).select('total status dueDate createdBy').populate({ path: 'createdBy', select: 'department' }).lean(),
      AuditEvent.find({ createdAt: { $gte: startTime, $lt: endTimeExclusive }, ...(department ? { actor: { $in: departmentUserIds } } : {}) }).sort({ createdAt: -1 }).limit(8).populate('actor', 'name').select('eventType outcome details createdAt actor').lean(),
    ])

    const employeeRecords = people.filter((person) => person.role !== 'admin')
    const activeEmployeeRecords = employeeRecords.filter((person) => person.isVerified !== false)
    const pendingApprovals = employeeRecords.filter((person) => person.isVerified === false).length
    const employeeIds = new Set(activeEmployeeRecords.map((person) => String(person._id)))
    const lateAfter = /^([01]\d|2[0-3]):[0-5]\d$/.test(process.env.ATTENDANCE_LATE_AFTER || '')
      ? process.env.ATTENDANCE_LATE_AFTER
      : DEFAULT_LATE_AFTER
    let presentDays = 0
    let lateCheckIns = 0
    let locationMatchedCheckIns = 0
    const weekdays = getWeekdays(startDate, endDate)
    const weekdaySet = new Set(weekdays)
    const attendanceByDay = new Map()

    for (const record of attendanceRecords) {
      if (!weekdaySet.has(record.dateKey)) continue
      const userId = String(record.user)
      if (!employeeIds.has(userId)) continue
      if (!attendanceByDay.has(record.dateKey)) attendanceByDay.set(record.dateKey, new Set())
      if (attendanceByDay.get(record.dateKey).has(userId)) continue
      attendanceByDay.get(record.dateKey).add(userId)
      presentDays += 1
      if (isLateCheckIn(record.checkIn, timeZone, lateAfter)) lateCheckIns += 1
      if (matchesLocationFilter(record, locationFilter, site)) locationMatchedCheckIns += 1
    }

    const approvedLeaveDaysByUser = new Map()
    for (const leave of approvedLeaves) {
      const employeeId = String(leave.requester)
      if (!employeeIds.has(employeeId)) continue
      if (!approvedLeaveDaysByUser.has(employeeId)) approvedLeaveDaysByUser.set(employeeId, new Set())
      for (const day of weekdays) {
        if (day >= leave.startDate && day <= leave.endDate) approvedLeaveDaysByUser.get(employeeId).add(day)
      }
    }
    let absentDays = 0
    let onLeaveDays = 0
    for (const employee of activeEmployeeRecords) {
      const employeeId = String(employee._id)
      const firstWorkday = dateKeyInTimeZone(employee.createdAt, timeZone)
      const employeeLeaveDays = approvedLeaveDaysByUser.get(employeeId) || new Set()
      for (const day of weekdays) {
        if (day < firstWorkday || attendanceByDay.get(day)?.has(employeeId)) continue
        if (employeeLeaveDays.has(day)) onLeaveDays += 1
        else absentDays += 1
      }
    }

    const taskSummary = tasks.reduce((summary, task) => {
      const createdInPeriod = task.createdAt >= startTime && task.createdAt < endTimeExclusive
      if (createdInPeriod) {
        summary.total += 1
        if (task.status === 'completed') summary.completed += 1
        else summary.open += 1
        const departmentName = task.department?.name || 'Unassigned'
        summary.byDepartment[departmentName] = (summary.byDepartment[departmentName] || 0) + 1
      }
      if (task.status !== 'completed' && task.dueDate && task.dueDate < new Date()) summary.overdue += 1
      return summary
    }, { total: 0, completed: 0, open: 0, overdue: 0, byDepartment: {} })

    const financial = invoices.reduce((summary, invoice) => {
      if (department && String(invoice.createdBy?.department || '') !== String(department._id)) return summary
      if (invoice.status === 'cancelled' || invoice.status === 'draft') {
        if (invoice.status === 'draft') summary.draftTotal += invoice.total
        return summary
      }
      summary.invoicedTotal += invoice.total
      if (invoice.status === 'paid') {
        summary.paidStatusTotal += invoice.total
        summary.paidCount += 1
      } else {
        summary.unpaidTotal += invoice.total
        summary.unpaidCount += 1
        if (invoice.status === 'overdue' || (invoice.status === 'sent' && invoice.dueDate < new Date())) {
          summary.overdueTotal += invoice.total
          summary.overdueCount += 1
        }
      }
      return summary
    }, { invoicedTotal: 0, paidStatusTotal: 0, paidCount: 0, unpaidTotal: 0, unpaidCount: 0, overdueTotal: 0, overdueCount: 0, draftTotal: 0 })

    return res.json({
      period: { startDate, endDate, timeZone },
      filters: {
        departments: departments.map(({ _id, name }) => ({ id: _id, name })),
        selectedDepartment: department ? { id: department._id, name: department.name } : null,
        location: locationFilter,
        locationOptions: locationFilters,
        geofenceConfigured: Boolean(site),
      },
      employees: { total: employeeRecords.length, active: activeEmployeeRecords.length, pendingApprovals },
      attendance: { presentDays, absentDays, lateCheckIns, onLeaveDays, locationMatchedCheckIns, lateAfter, locationFilter },
      leave: { pendingRequests: pendingLeaves },
      tasks: taskSummary,
      invoices: { ...financial, currency: 'INR', revenueCollectedTracked: false },
      expenses: { tracked: false },
      recentActivities: recentActivities.map((event) => ({
        id: event._id,
        type: event.eventType,
        outcome: event.outcome,
        actor: event.actor?.name || 'System',
        createdAt: event.createdAt,
      })),
    })
  } catch (error) { return next(error) }
}

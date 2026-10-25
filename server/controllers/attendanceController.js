import mongoose from 'mongoose'
import Attendance from '../models/attendance.js'
import User from '../models/user.js'
import Role from '../models/role.js'
import LeaveRequest from '../models/leaveRequest.js'
import { notifyUsers } from '../services/notifications.js'
import { getPaginationOptions, paginateQuery } from '../utils/pagination.js'
import { assessAttendanceLocation, getAttendanceLocationPolicy } from '../services/attendanceLocation.js'
/** Notifies the employee and relevant organization leads after a check-in/out event. */
async function notifyAttendanceEvent(user, action, dateKey) {
  const actionLabel = action === 'check-in' ? 'checked in' : 'checked out'
  await notifyUsers([user._id], {
    type: 'attendance', title: 'Attendance recorded', message: `Your ${actionLabel} was recorded for ${dateKey}.`,
    page: 'attendance',
  })
  const departmentId = user.department?._id || user.department
  const [organizationLeads, departmentManagers] = await Promise.all([
    User.find({ role: { $in: ['admin', 'hr'] }, isVerified: { $ne: false } }).distinct('_id'),
    departmentId ? User.find({ role: 'manager', department: departmentId, isVerified: { $ne: false } }).distinct('_id') : [],
  ])
  await notifyUsers([...organizationLeads, ...departmentManagers], {
    actorId: user._id, actorName: user.name, type: 'attendance', title: `${user.name} ${actionLabel}`,
    message: `${user.name} ${actionLabel} on ${dateKey}.`, page: 'attendance',
  })
}

/** Alerts admins, HR, and the employee's manager when GPS evidence needs human review. */
async function notifyLocationReviewers(user, dateKey, attendanceId, { gpsUnavailable = false } = {}) {
  const departmentId = user.department?._id || user.department
  const [organizationLeads, departmentManagers] = await Promise.all([
    User.find({ role: { $in: ['admin', 'hr'] }, isVerified: { $ne: false } }).distinct('_id'),
    departmentId ? User.find({ role: 'manager', department: departmentId, isVerified: { $ne: false } }).distinct('_id') : [],
  ])
  const reviewerIds = [...organizationLeads, ...departmentManagers].filter((id) => String(id) !== String(user._id))
  await notifyUsers(reviewerIds, {
    actorId: user._id, actorName: user.name, type: 'attendance', title: gpsUnavailable ? 'GPS exception needs attendance review' : 'Attendance location review requested',
    message: gpsUnavailable ? `${user.name} checked in without GPS on ${dateKey}; a review is needed.` : `${user.name} submitted an attendance location for review on ${dateKey}.`, page: 'attendance', entityId: String(attendanceId),
  })
}

// A configurable business timezone keeps an attendance day aligned with the workplace.
const attendanceTimeZone = process.env.APP_TIME_ZONE || 'Asia/Kolkata'
/** Returns today's date key in the configured workplace timezone. */
const todayKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: attendanceTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

/** Returns today's attendance and the records visible to the signed-in role. */
export async function getAttendance(req, res, next) {
  try {
    const dateKey = todayKey()
    const today = await Attendance.findOne({ user: req.user._id, dateKey }).lean()
    let filter = {}
    if (req.user.role === 'manager') {
      if (!req.user.department?._id) return res.status(400).json({ message: 'A department must be assigned to your manager account.' })
      const teamIds = await User.find({ department: req.user.department._id }).distinct('_id')
      filter = { user: { $in: teamIds }, dateKey }
    } else if (!['admin', 'hr'].includes(req.user.role)) {
      filter = { user: req.user._id }
    } else {
      filter = { dateKey }
    }
    const page = await paginateQuery(Attendance.find(filter).populate('user', 'name email role').sort({ checkIn: -1 }).lean(), Attendance.countDocuments(filter), getPaginationOptions(req.query))
    return res.json({ today, records: page.items, pagination: page.pagination, dateKey })
  } catch (error) { return next(error) }
}

/** Lists pending GPS exceptions and correction requests for HR, admins, and department managers. */
export async function getLocationReviewQueue(req, res, next) {
  const filter = {
    $or: [
      { locationReviewStatus: 'pending' },
      { 'locationCorrection.status': 'pending' },
    ],
  }
  try {
    if (req.user.role === 'manager') {
      if (!req.user.department?._id) return res.status(400).json({ message: 'A department must be assigned to your manager account.' })
      const teamIds = await User.find({ department: req.user.department._id }).distinct('_id')
      filter.user = { $in: teamIds }
    }
    const results = await paginateQuery(
      Attendance.find(filter).populate('user', 'name email role department').sort({ checkIn: -1 }).lean(),
      Attendance.countDocuments(filter),
      getPaginationOptions(req.query),
    )
    return res.json({ records: results.items, pagination: results.pagination })
  } catch (error) { return next(error) }
}


/** Derives the current YYYY-MM reporting month from the workplace date. */
const currentMonthKey = () => todayKey().slice(0, 7)

/** Returns the latest earlier GPS record so a new reading can be checked for unusual travel. */
async function findPreviousLocationRecord(userId, dateKey) {
  return Attendance.findOne({ user: userId, dateKey: { $lt: dateKey }, checkInLocation: { $ne: null } })
    .select('checkIn checkInLocation').sort({ checkIn: -1 }).lean()
}

/** Builds server-owned GPS metadata and keeps the device timestamp separate as untrusted data. */
function createLocationSnapshot(location, serverTime = new Date()) {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracyMeters ?? null,
    clientReportedAt: location.clientReportedAt ? new Date(location.clientReportedAt) : null,
    recordedAt: serverTime,
  }
}

/** Restricts manager location reviews to users in the reviewer's own department. */
function managerCanReviewAttendance(manager, attendanceUser) {
  const managerDepartmentId = manager.department?._id || manager.department
  const attendanceDepartmentId = attendanceUser?.department?._id || attendanceUser?.department
  return Boolean(managerDepartmentId && attendanceDepartmentId && String(managerDepartmentId) === String(attendanceDepartmentId))
}

/** Builds an admin-only month report with user roles, departments, and present/absent days. */
export async function getAdminMonthlyAttendance(req, res, next) {
  const month = typeof req.query.month === 'string' ? req.query.month : currentMonthKey()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ message: 'Choose a valid month in YYYY-MM format.' })
  }

  try {
    const currentMonth = currentMonthKey()
    const lastDay = new Date(`${month}-01T00:00:00.000Z`)
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0)
    const monthEnd = lastDay.toISOString().slice(0, 10)
    const lastVisibleDay = month > currentMonth ? `${month}-00` : month === currentMonth ? todayKey() : monthEnd
    const days = []
    for (let cursor = new Date(`${month}-01T12:00:00.000Z`); cursor.toISOString().slice(0, 10) <= lastVisibleDay; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const day = cursor.toISOString().slice(0, 10)
      if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) days.push(day)
    }

    const [users, records, roles, approvedLeaves] = await Promise.all([
      User.find().select('name email role department isVerified').populate('department', 'name').sort({ name: 1 }).lean(),
      Attendance.find({ dateKey: { $gte: `${month}-01`, $lte: monthEnd } }).select('user dateKey checkIn checkOut checkInLocation locationFlags locationExceptionReason locationReviewStatus locationReviewedBy locationReviewedAt locationReviewNote locationCorrection').lean(),
      Role.find().select('key name').lean(),
      LeaveRequest.find({ status: 'approved', startDate: { $lte: monthEnd }, endDate: { $gte: `${month}-01` } }).select('requester startDate endDate').lean(),
    ])
    const roleNames = new Map(roles.map((role) => [role.key, role.name]))
    const recordsByUser = new Map()
    for (const record of records) {
      const id = String(record.user)
      if (!recordsByUser.has(id)) recordsByUser.set(id, new Map())
      recordsByUser.get(id).set(record.dateKey, record)
    }

    const leaveDaysByUser = new Map()
    for (const leave of approvedLeaves) {
      const userId = String(leave.requester)
      if (!leaveDaysByUser.has(userId)) leaveDaysByUser.set(userId, new Set())
      for (const day of days) {
        if (day >= leave.startDate && day <= leave.endDate) leaveDaysByUser.get(userId).add(day)
      }
    }

    const attendanceUsers = users.map((user) => {
      const userRecords = recordsByUser.get(String(user._id)) || new Map()
      const userLeaveDays = leaveDaysByUser.get(String(user._id)) || new Set()
      const daily = days.map((dateKey) => {
        const record = userRecords.get(dateKey)
        return { dateKey, status: record ? 'present' : userLeaveDays.has(dateKey) ? 'leave' : user.isVerified === false ? 'pending' : 'absent', attendanceId: record?._id || null, checkIn: record?.checkIn || null, checkOut: record?.checkOut || null, checkInLocation: record?.checkInLocation || null, locationFlags: record?.locationFlags || [], locationExceptionReason: record?.locationExceptionReason || '', locationReviewStatus: record?.locationReviewStatus || 'clear', locationCorrection: record?.locationCorrection || null }
      })
      return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleName: roleNames.get(user.role) || user.role,
        department: user.department?.name || 'Unassigned',
        isVerified: user.isVerified,
        present: daily.filter((day) => day.status === 'present').length,
        absent: daily.filter((day) => day.status === 'absent').length,
        leave: daily.filter((day) => day.status === 'leave').length,
        pending: user.isVerified === false,
        daily,
      }
    })
    const summary = attendanceUsers.reduce((totals, person) => ({
      present: totals.present + person.present,
      absent: totals.absent + person.absent,
      leave: totals.leave + person.leave,
    }), { present: 0, absent: 0, leave: 0 })
    const pagination = getPaginationOptions(req.query)
    const totalItems = attendanceUsers.length
    const totalPages = Math.ceil(totalItems / pagination.pageSize)
    const page = totalPages ? Math.min(pagination.page, totalPages) : 1
    const first = (page - 1) * pagination.pageSize
    return res.json({ month, timeZone: attendanceTimeZone, days, users: attendanceUsers.slice(first, first + pagination.pageSize), summary, pagination: { page, pageSize: pagination.pageSize, totalItems, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } })
  } catch (error) { return next(error) }
}
/** Records one check-in per local business day, including optional GPS coordinates. */
export async function checkIn(req, res, next) {
  const location = req.body?.location
  const exceptionReason = typeof req.body?.exceptionReason === 'string' ? req.body.exceptionReason.trim() : ''
  if (!location && (exceptionReason.length < 3 || exceptionReason.length > 1000)) {
    return res.status(400).json({ message: 'Provide GPS location or explain why it is unavailable.' })
  }
  if (location) {
    const { latitude, longitude, accuracyMeters, clientReportedAt } = location
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ message: 'Allow location access and try checking in again.' })
    }
    if (accuracyMeters !== undefined && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 50_000)) {
      return res.status(400).json({ message: 'Invalid GPS accuracy value.' })
    }
    if (clientReportedAt !== undefined && (typeof clientReportedAt !== 'string' || Number.isNaN(Date.parse(clientReportedAt)))) {
      return res.status(400).json({ message: 'Invalid device location timestamp.' })
    }
  }
  try {
    const today = todayKey()
    const receivedAt = new Date()
    let locationSnapshot = null
    let locationFlags = ['gps-unavailable']
    if (location) {
      locationSnapshot = createLocationSnapshot(location, receivedAt)
      const previousRecord = await findPreviousLocationRecord(req.user._id, today)
      locationFlags = assessAttendanceLocation({ location: locationSnapshot, serverTime: receivedAt, previousRecord, policy: getAttendanceLocationPolicy() })
    }
    const record = await Attendance.create({
      user: req.user._id,
      dateKey: today,
      checkIn: receivedAt,
      checkInLocation: locationSnapshot,
      locationFlags,
      locationExceptionReason: location ? '' : exceptionReason,
      locationReviewStatus: locationFlags.length ? 'pending' : 'clear',
    })
    await notifyAttendanceEvent(req.user, 'check-in', today)
    if (locationFlags.length) await notifyLocationReviewers(req.user, today, record._id, { gpsUnavailable: !location })
    return res.status(201).json({ today: record, message: 'You are checked in.' })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'You have already checked in today.' })
    return next(error)
  }
}


/** Adds or refreshes GPS coordinates for an existing same-day attendance record. */
export async function updateAttendanceLocation(req, res, next) {
  const location = req.body?.location || {}
  const { latitude, longitude, accuracyMeters, clientReportedAt } = location
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: 'Allow location access and try again.' })
  }
  if (accuracyMeters !== undefined && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 50_000)) {
    return res.status(400).json({ message: 'Invalid GPS accuracy value.' })
  }
  if (clientReportedAt !== undefined && (typeof clientReportedAt !== 'string' || Number.isNaN(Date.parse(clientReportedAt)))) {
    return res.status(400).json({ message: 'Invalid device location timestamp.' })
  }
  try {
    const record = await Attendance.findOne({ user: req.user._id, dateKey: todayKey() })
    if (!record) return res.status(404).json({ message: 'Check in before recording your location.' })
    if (record.checkOut) return res.status(409).json({ message: 'Location can only be recorded before you check out.' })
    if (record.checkInLocation) return res.status(409).json({ message: 'Location is already recorded. Submit a correction request for review.' })
    const receivedAt = new Date()
    const locationSnapshot = createLocationSnapshot(location, receivedAt)
    const previousRecord = await findPreviousLocationRecord(req.user._id, record.dateKey)
    const locationFlags = assessAttendanceLocation({ location: locationSnapshot, serverTime: receivedAt, previousRecord, policy: getAttendanceLocationPolicy() })
    record.checkInLocation = locationSnapshot
    record.locationFlags = locationFlags
    record.locationReviewStatus = locationFlags.length ? 'pending' : 'clear'
    await record.save()
    return res.json({ today: record, message: 'Your current location has been saved to today’s attendance record.' })
  } catch (error) { return next(error) }
}

/** Lets an employee submit corrected GPS evidence without overwriting the original reading. */
export async function requestAttendanceLocationCorrection(req, res, next) {
  const { latitude, longitude, accuracyMeters, clientReportedAt } = req.body?.location || {}
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (!reason || reason.length > 1000) return res.status(400).json({ message: 'Explain why the attendance location needs correction.' })
  const attendanceId = req.params.id
  if (!mongoose.isValidObjectId(attendanceId)) return res.status(400).json({ message: 'Invalid attendance record.' })
  try {
    const record = await Attendance.findOne({ _id: attendanceId, user: req.user._id })
    if (!record) return res.status(404).json({ message: 'Attendance record not found.' })
    if (record.locationCorrection?.status === 'pending') return res.status(409).json({ message: 'A location correction is already waiting for review.' })
    const receivedAt = new Date()
    record.locationCorrection = {
      location: createLocationSnapshot({ latitude, longitude, accuracyMeters, clientReportedAt }, receivedAt),
      reason,
      requestedAt: receivedAt,
      status: 'pending',
    }
    record.locationReviewStatus = 'pending'
    await record.save()
    await notifyLocationReviewers(req.user, record.dateKey, record._id)
    return res.status(201).json({ message: 'Correction submitted for manager review.', attendance: record })
  } catch (error) { return next(error) }
}

/** Allows an authorized lead to review a GPS flag or approve/reject an employee correction. */
export async function reviewAttendanceLocation(req, res, next) {
  const { decision, message = '' } = req.body || {}
  const attendanceId = req.params.id
  if (!mongoose.isValidObjectId(attendanceId)) return res.status(400).json({ message: 'Invalid attendance record.' })
  try {
    const record = await Attendance.findById(attendanceId).populate('user', 'department')
    if (!record) return res.status(404).json({ message: 'Attendance record not found.' })
    if (req.user.role === 'manager' && !managerCanReviewAttendance(req.user, record.user)) {
      return res.status(403).json({ message: 'You can review attendance locations only for your department.' })
    }
    if (decision === 'reviewed') {
      record.locationReviewStatus = 'reviewed'
      record.locationReviewedBy = req.user._id
      record.locationReviewedAt = new Date()
      record.locationReviewNote = message.trim()
    } else {
      if (!record.locationCorrection || record.locationCorrection.status !== 'pending') {
        return res.status(409).json({ message: 'There is no pending location correction to review.' })
      }
      record.locationCorrection.status = decision === 'approve-correction' ? 'approved' : 'rejected'
      record.locationCorrection.reviewedBy = req.user._id
      record.locationCorrection.reviewedAt = new Date()
      record.locationCorrection.reviewMessage = message.trim()
      record.locationReviewStatus = 'reviewed'
      record.locationReviewedBy = req.user._id
      record.locationReviewedAt = new Date()
      record.locationReviewNote = message.trim()
    }
    await record.save()
    await notifyUsers([record.user._id], {
      actorId: req.user._id, actorName: req.user.name, type: 'attendance', title: 'Attendance location reviewed',
      message: `Your attendance location for ${record.dateKey} was reviewed.`, page: 'attendance', entityId: String(record._id),
    })
    return res.json({ message: 'Attendance location review saved.', attendance: record })
  } catch (error) { return next(error) }
}
/** Records the employee's checkout time and announces the attendance update. */
export async function checkOut(req, res, next) {
  if (!mongoose.isValidObjectId(req.user._id)) return res.status(400).json({ message: 'Invalid account.' })
  try {
    const record = await Attendance.findOne({ user: req.user._id, dateKey: todayKey() })
    if (!record) return res.status(400).json({ message: 'Check in before checking out.' })
    if (record.checkOut) return res.status(409).json({ message: 'You have already checked out today.' })
    record.checkOut = new Date()
    await record.save()
    await notifyAttendanceEvent(req.user, 'check-out', record.dateKey)
    return res.json({ today: record, message: 'You are checked out.' })
  } catch (error) { return next(error) }
}

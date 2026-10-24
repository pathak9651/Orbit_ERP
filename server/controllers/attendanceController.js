import mongoose from 'mongoose'
import Attendance from '../models/attendance.js'
import User from '../models/user.js'
import Role from '../models/role.js'
import LeaveRequest from '../models/leaveRequest.js'
import { notifyUsers } from '../services/notifications.js'
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
    const records = await Attendance.find(filter).populate('user', 'name email role').sort({ checkIn: -1 }).limit(100).lean()
    return res.json({ today, records, dateKey })
  } catch (error) { return next(error) }
}


/** Derives the current YYYY-MM reporting month from the workplace date. */
const currentMonthKey = () => todayKey().slice(0, 7)

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
      Attendance.find({ dateKey: { $gte: `${month}-01`, $lte: monthEnd } }).select('user dateKey checkIn checkOut checkInLocation').lean(),
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
        return { dateKey, status: record ? 'present' : userLeaveDays.has(dateKey) ? 'leave' : user.isVerified === false ? 'pending' : 'absent', checkIn: record?.checkIn || null, checkOut: record?.checkOut || null, checkInLocation: record?.checkInLocation || null }
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
    return res.json({ month, timeZone: attendanceTimeZone, days, users: attendanceUsers })
  } catch (error) { return next(error) }
}
/** Records one check-in per local business day, including optional GPS coordinates. */
export async function checkIn(req, res, next) {
  const { latitude, longitude, accuracyMeters } = req.body?.location || {}
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: 'Allow location access and try checking in again.' })
  }
  if (accuracyMeters !== undefined && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0)) {
    return res.status(400).json({ message: 'Invalid GPS accuracy value.' })
  }
  try {
    const today = todayKey()
    const record = await Attendance.create({ user: req.user._id, dateKey: today, checkIn: new Date(), checkInLocation: { latitude, longitude, accuracyMeters: accuracyMeters ?? null } })
    await notifyAttendanceEvent(req.user, 'check-in', today)
    return res.status(201).json({ today: record, message: 'You are checked in.' })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'You have already checked in today.' })
    return next(error)
  }
}


/** Adds or refreshes GPS coordinates for an existing same-day attendance record. */
export async function updateAttendanceLocation(req, res, next) {
  const { latitude, longitude, accuracyMeters } = req.body?.location || {}
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: 'Allow location access and try again.' })
  }
  if (accuracyMeters !== undefined && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0)) {
    return res.status(400).json({ message: 'Invalid GPS accuracy value.' })
  }
  try {
    const record = await Attendance.findOne({ user: req.user._id, dateKey: todayKey() })
    if (!record) return res.status(404).json({ message: 'Check in before recording your location.' })
    if (record.checkOut) return res.status(409).json({ message: 'Location can only be recorded before you check out.' })
    record.checkInLocation = { latitude, longitude, accuracyMeters: accuracyMeters ?? null }
    await record.save()
    return res.json({ today: record, message: 'Your current location has been saved to today’s attendance record.' })
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

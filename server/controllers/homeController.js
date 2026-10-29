import Attendance from '../models/attendance.js'
import CalendarEvent from '../models/calendarEvent.js'
import LeaveRequest from '../models/leaveRequest.js'
import Notification from '../models/notification.js'
import Task from '../models/task.js'
import User from '../models/user.js'

/** Returns today's date in the workplace timezone for the employee's attendance card. */
export function getWorkplaceDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

/** Builds the personalized landing summary without returning unneeded collection records. */
export async function getHomeSummary(req, res, next) {
  const now = new Date()
  const timeZone = process.env.APP_TIME_ZONE || 'Asia/Kolkata'
  const dateKey = getWorkplaceDateKey(now, timeZone)
  const taskFilter = {}
  const isReviewAuthority = ['admin', 'hr', 'manager'].includes(req.user.role)

  try {
    if (req.user.role === 'manager') {
      if (!req.user.department?._id) return res.status(400).json({ message: 'A department must be assigned to your manager account.' })
      const teamIds = await User.find({ department: req.user.department._id }).distinct('_id')
      taskFilter.$or = [{ assignedTo: { $in: teamIds } }, { assignedBy: req.user._id }]
    } else if (!['admin', 'hr'].includes(req.user.role)) {
      taskFilter.$or = [{ assignedTo: req.user._id }, { assignedBy: req.user._id }]
    }

    const ownLeaveFilter = { requester: req.user._id }
    const reviewQueueFilter = { status: 'pending', currentStage: req.user.role, requester: { $ne: req.user._id } }
    if (req.user.role === 'manager') reviewQueueFilter.department = req.user.department._id
    const calendarFilter = { startAt: { $gte: now }, endAt: { $gte: now } }

    const [taskStatuses, focusTasks, todayAttendance, leaveStatuses, pendingForReview, upcomingEvents, unreadCount, recentNotifications] = await Promise.all([
      Task.aggregate([{ $match: taskFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Task.find({ ...taskFilter, status: { $ne: 'completed' } }).populate('assignedTo', 'name role').populate('assignedBy', 'name role').populate('department', 'name').sort({ dueDate: 1, createdAt: -1 }).limit(5).lean(),
      Attendance.findOne({ user: req.user._id, dateKey }).select('checkIn checkOut dateKey').lean(),
      LeaveRequest.aggregate([{ $match: ownLeaveFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      isReviewAuthority ? LeaveRequest.countDocuments(reviewQueueFilter) : Promise.resolve(0),
      CalendarEvent.find(calendarFilter).select('title type startAt endAt allDay location').sort({ startAt: 1 }).limit(4).lean(),
      Notification.countDocuments({ recipient: req.user._id, readAt: null }),
      Notification.find({ recipient: req.user._id }).select('type title message page entityId readAt createdAt').sort({ createdAt: -1 }).limit(5).lean(),
    ])

    const countFor = (rows, status) => rows.find((row) => row._id === status)?.count || 0
    const totalTasks = taskStatuses.reduce((total, row) => total + row.count, 0)
    const completedTasks = countFor(taskStatuses, 'completed')
    const openTasks = Math.max(totalTasks - completedTasks, 0)
    const totalLeaves = leaveStatuses.reduce((total, row) => total + row.count, 0)

    return res.json({
      today: { dateKey, timeZone, attendance: todayAttendance ? { checkIn: todayAttendance.checkIn, checkOut: todayAttendance.checkOut } : null },
      organization: { role: req.user.role, department: req.user.department?.name || '' },
      tasks: { total: totalTasks, open: openTasks, completed: completedTasks, completionRate: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0, focus: focusTasks },
      leaves: { total: totalLeaves, pending: countFor(leaveStatuses, 'pending'), approved: countFor(leaveStatuses, 'approved'), pendingForReview },
      calendar: upcomingEvents,
      notifications: { unreadCount, recent: recentNotifications.map((notification) => ({ id: String(notification._id), type: notification.type, title: notification.title, message: notification.message, page: notification.page, entityId: notification.entityId, readAt: notification.readAt, createdAt: notification.createdAt })) },
    })
  } catch (error) { return next(error) }
}

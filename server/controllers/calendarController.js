import CalendarEvent from '../models/calendarEvent.js'
import User from '../models/user.js'
import { recordAuditEvent } from '../services/audit.js'
import { notifyUsers } from '../services/notifications.js'
import { getPaginationOptions, paginateQuery } from '../utils/pagination.js'
import { canScheduleCalendarType } from '../configs/authorization.js'

const REMINDER_OPTIONS = new Set([0, 5, 15, 30, 60, 1440])
const eventTypes = new Set(['holiday', 'event', 'meeting'])
const eventTitles = { holiday: 'Office holiday', event: 'Company event', meeting: 'Meeting' }

/** Saves calendar activity without making a successful event change depend on audit availability. */
async function recordCalendarAudit(req, event) {
  try { await recordAuditEvent(req, event) }
  catch (error) { console.error('Calendar audit write failed:', error.message) }
}

/** Builds the reminder timestamp from the event start and selected lead time. */
function reminderDate(startAt, reminderMinutes) {
  return reminderMinutes ? new Date(startAt.getTime() - reminderMinutes * 60_000) : null
}

/** Returns calendar events overlapping the requested date range using server-side pagination. */
export async function listCalendarEvents(req, res, next) {
  const startAt = new Date(req.query.start)
  const endAt = new Date(req.query.end)
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt || endAt - startAt > 93 * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ message: 'Choose a valid calendar date range of 93 days or fewer.' })
  }

  try {
    const filter = { startAt: { $lt: endAt }, endAt: { $gte: startAt } }
    const page = await paginateQuery(
      CalendarEvent.find(filter).populate('createdBy', 'name role').sort({ startAt: 1, _id: 1 }),
      CalendarEvent.countDocuments(filter),
      getPaginationOptions(req.query, { defaultPageSize: 100, maxPageSize: 100 }),
    )
    return res.json({ events: page.items, pagination: page.pagination })
  } catch (error) { return next(error) }
}

/** Creates an office event; HR may schedule meetings while administrators may add any event type. */
export async function createCalendarEvent(req, res, next) {
  const { title, description = '', type, startAt: startValue, endAt: endValue, allDay = false, location = '', reminderMinutes = 15 } = req.body
  const startAt = new Date(startValue)
  const endAt = new Date(endValue)
  if (!eventTypes.has(type) || !canScheduleCalendarType(req.user, type)) {
    return res.status(403).json({ message: 'HR can schedule meetings; only administrators can add holidays and company events.' })
  }
  if (!REMINDER_OPTIONS.has(reminderMinutes)) return res.status(400).json({ message: 'Choose a valid reminder time.' })
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return res.status(400).json({ message: 'The event end must be after its start.' })
  }

  try {
    const event = await CalendarEvent.create({
      title: title.trim(), description: description.trim(), type, startAt, endAt, allDay,
      location: location.trim(), reminderMinutes,
      reminderAt: reminderDate(startAt, reminderMinutes), createdBy: req.user._id,
    })
    await recordCalendarAudit(req, { eventType: 'calendar_event_created' })
    await event.populate('createdBy', 'name role')
    return res.status(201).json({ event, message: `${eventTitles[type]} scheduled.` })
  } catch (error) { return next(error) }
}

/** Lets administrators edit event details and resets the reminder when the schedule changes. */
export async function updateCalendarEvent(req, res, next) {
  const { title, description = '', type, startAt: startValue, endAt: endValue, allDay = false, location = '', reminderMinutes = 15 } = req.body
  const startAt = new Date(startValue)
  const endAt = new Date(endValue)
  if (!eventTypes.has(type) || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return res.status(400).json({ message: 'Enter valid event details and a valid time range.' })
  }
  if (!REMINDER_OPTIONS.has(reminderMinutes)) return res.status(400).json({ message: 'Choose a valid reminder time.' })

  try {
    const event = await CalendarEvent.findByIdAndUpdate(req.params.id, {
      $set: {
        title: title.trim(), description: description.trim(), type, startAt, endAt, allDay,
        location: location.trim(), reminderMinutes,
        reminderAt: reminderDate(startAt, reminderMinutes), reminderSentAt: null,
      },
    }, { returnDocument: 'after', runValidators: true }).populate('createdBy', 'name role')
    if (!event) return res.status(404).json({ message: 'Calendar event not found.' })
    await recordCalendarAudit(req, { eventType: 'calendar_event_updated' })
    return res.json({ event, message: 'Calendar event updated.' })
  } catch (error) { return next(error) }
}

/** Removes a calendar entry; only administrators can reach this handler. */
export async function deleteCalendarEvent(req, res, next) {
  try {
    const event = await CalendarEvent.findByIdAndDelete(req.params.id)
    if (!event) return res.status(404).json({ message: 'Calendar event not found.' })
    await recordCalendarAudit(req, { eventType: 'calendar_event_deleted' })
    return res.json({ message: 'Calendar event removed.' })
  } catch (error) { return next(error) }
}

/** Sends each due reminder once across all app instances using an atomic database claim. */
export async function sendDueCalendarReminders(now = new Date()) {
  const dueEvents = await CalendarEvent.find({ reminderAt: { $lte: now }, startAt: { $gt: now }, reminderSentAt: null, reminderMinutes: { $gt: 0 } })
    .select('title type startAt reminderAt').sort({ reminderAt: 1 }).limit(100).lean()
  if (!dueEvents.length) return 0

  const recipientIds = await User.find({ isVerified: { $ne: false } }).distinct('_id')
  let sentCount = 0
  for (const event of dueEvents) {
    const claimedEvent = await CalendarEvent.findOneAndUpdate(
      { _id: event._id, reminderSentAt: null, reminderAt: { $lte: now } },
      { $set: { reminderSentAt: now } },
      { returnDocument: 'after' },
    )
    if (!claimedEvent) continue
    const startsAt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(event.startAt)
    await notifyUsers(recipientIds, {
      type: 'calendar', title: `${eventTitles[event.type]} reminder`,
      message: `${event.title} starts ${startsAt}${event.location ? ` at ${event.location}` : ''}.`,
      page: 'calendar', entityId: String(event._id),
    })
    sentCount += 1
  }
  return sentCount
}

/** Checks for due reminders once a minute and runs once at startup to catch jobs after restarts. */
export function scheduleCalendarReminders() {
  const timer = setInterval(() => {
    sendDueCalendarReminders().catch((error) => console.error('Calendar reminder delivery failed:', error.message))
  }, 60_000)
  timer.unref()
  return sendDueCalendarReminders().catch((error) => {
    console.error('Initial calendar reminder delivery failed:', error.message)
    return 0
  })
}

import test from 'node:test'
import assert from 'node:assert/strict'
import CalendarEvent from '../models/calendarEvent.js'
import Notification from '../models/notification.js'
import User from '../models/user.js'
import { createCalendarEvent, sendDueCalendarReminders } from '../controllers/calendarController.js'
import { validateRequestBody } from '../utils/validation.js'

const eventPayload = {
  title: 'Quarterly planning',
  description: 'Department planning session',
  type: 'meeting',
  startAt: '2027-01-12T09:00:00.000Z',
  endAt: '2027-01-12T10:00:00.000Z',
  allDay: false,
  location: 'Conference room',
  reminderMinutes: 15,
}

test('calendar event validation accepts valid events and rejects invalid ranges or reminder values', () => {
  assert.deepEqual(validateRequestBody('calendarEvent', eventPayload), [])
  assert.ok(validateRequestBody('calendarEvent', { ...eventPayload, endAt: eventPayload.startAt }).length)
  assert.ok(validateRequestBody('calendarEvent', { ...eventPayload, reminderMinutes: 3 }).length)
  assert.ok(validateRequestBody('calendarEvent', { ...eventPayload, type: 'unapproved' }).length)
})

test('HR cannot create office holidays or general company events', async () => {
  const result = { status: 200, body: null }
  const response = {
    status(status) { result.status = status; return this },
    json(body) { result.body = body; return this },
  }
  await createCalendarEvent({ body: { ...eventPayload, type: 'holiday' }, user: { role: 'hr' } }, response, (error) => { throw error })
  assert.equal(result.status, 403)
  assert.match(result.body.message, /only administrators/i)
})

test('due calendar reminders notify verified users through one atomic event claim', async (context) => {
  const now = new Date('2027-01-12T08:45:00.000Z')
  const dueEvent = { _id: '64b000000000000000000001', title: 'Quarterly planning', type: 'meeting', startAt: new Date('2027-01-12T09:00:00.000Z') }
  const notifications = []
  context.mock.method(CalendarEvent, 'find', () => ({
    select() { return this },
    sort() { return this },
    limit() { return this },
    lean: async () => [dueEvent],
  }))
  context.mock.method(CalendarEvent, 'findOneAndUpdate', async () => ({ _id: dueEvent._id }))
  context.mock.method(User, 'find', () => ({ distinct: async () => ['64b000000000000000000002', '64b000000000000000000003'] }))
  context.mock.method(Notification, 'insertMany', async (records) => { notifications.push(...records) })

  assert.equal(await sendDueCalendarReminders(now), 1)
  assert.equal(notifications.length, 2)
  assert.ok(notifications.every((notification) => notification.type === 'calendar' && notification.page === 'calendar'))
  assert.ok(notifications.every((notification) => notification.message.includes('Quarterly planning')))
})

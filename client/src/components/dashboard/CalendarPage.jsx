import { useCallback, useEffect, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import LoadingState from '../common/LoadingState.jsx'
import Pagination from '../common/Pagination.jsx'
import { createCalendarEvent, deleteCalendarEvent, getCalendarEvents, updateCalendarEvent } from '../../services/api.js'
import { validateClientForm } from '../../services/validation.js'

const eventLabels = { holiday: 'Office holiday', event: 'Company event', meeting: 'Meeting' }
const reminderOptions = [[0, 'No reminder'], [5, '5 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [1440, '1 day before']]

function localDateValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function localDateTimeValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function makeEventForm() {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start.getTime() + 60 * 60_000)
  return { title: '', description: '', type: 'holiday', startAt: localDateTimeValue(start), endAt: localDateTimeValue(end), allDay: false, location: '', reminderMinutes: 15 }
}

function getDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function eventFormValues(event) {
  const start = new Date(event.startAt)
  const end = new Date(event.endAt)
  return {
    title: event.title,
    description: event.description || '',
    type: event.type,
    startAt: event.allDay ? localDateValue(start) : localDateTimeValue(start),
    endAt: event.allDay ? localDateValue(end) : localDateTimeValue(end),
    allDay: Boolean(event.allDay),
    location: event.location || '',
    reminderMinutes: event.reminderMinutes ?? 15,
  }
}

function eventDatesForForm(form) {
  const startAt = form.allDay ? new Date(`${form.startAt}T00:00:00`) : new Date(form.startAt)
  const endAt = form.allDay ? new Date(`${form.endAt}T23:59:59.999`) : new Date(form.endAt)
  return { ...form, startAt: startAt.toISOString(), endAt: endAt.toISOString() }
}

/** Displays company events to everyone, gives HR meeting scheduling, and admin event management. */
export default function CalendarPage({ user }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [events, setEvents] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [form, setForm] = useState(makeEventForm)
  const [editingId, setEditingId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const isAdmin = user.role === 'admin'
  const canSchedule = isAdmin || user.role === 'hr'

  const loadEvents = useCallback(async () => {
    setError('')
    const start = new Date(month.getFullYear(), month.getMonth(), 1)
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    try {
      const result = await getCalendarEvents({ start: start.toISOString(), end: end.toISOString(), page, pageSize: 100 })
      setEvents(result.events || [])
      setPagination(result.pagination)
    } catch (requestError) { setError(requestError.message || 'Could not load the office calendar.') }
    finally { setLoading(false) }
  }, [month, page])

  useEffect(() => { loadEvents() }, [loadEvents])

  function moveMonth(offset) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
    setPage(1)
  }

  function beginCreate() {
    const nextForm = makeEventForm()
    if (!isAdmin) nextForm.type = 'meeting'
    setForm(nextForm)
    setEditingId('')
    setShowForm(true)
  }

  function beginEdit(event) {
    setForm(eventFormValues(event))
    setEditingId(event._id)
    setShowForm(true)
  }

  async function saveEvent(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const eventDetails = eventDatesForForm(form)
      const validationMessage = validateClientForm('calendarEvent', eventDetails)
      if (validationMessage) throw new Error(validationMessage)
      const result = editingId
        ? await updateCalendarEvent(editingId, eventDetails)
        : await createCalendarEvent(eventDetails)
      setNotice(result.message)
      setShowForm(false)
      setEditingId('')
      await loadEvents()
    } catch (requestError) { setError(requestError.message || 'Could not save this calendar event.') }
    finally { setBusy(false) }
  }

  async function removeEvent(event) {
    if (!window.confirm(`Remove “${event.title}” from the office calendar?`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await deleteCalendarEvent(event._id)
      setNotice(result.message)
      await loadEvents()
    } catch (requestError) { setError(requestError.message || 'Could not remove this event.') }
    finally { setBusy(false) }
  }

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const firstWeekdayOffset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7
  const dayCount = Math.ceil((firstWeekdayOffset + daysInMonth) / 7) * 7
  const calendarDays = Array.from({ length: dayCount }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - firstWeekdayOffset + 1))
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)

  return <section className="main-panel"><main className="dashboard-content work-page-content calendar-page-content">
    <div className="page-heading"><div><span className="eyebrow">WORKSPACE</span><h1>Office calendar</h1><p>Company holidays, events, and meetings. Calendar reminders appear in your notifications.</p></div>{canSchedule && <button className="button button-primary" type="button" onClick={beginCreate}>Schedule {isAdmin ? 'an event' : 'a meeting'}</button>}</div>
    {error && <p className="form-message error" role="alert">{error}</p>}{notice && <p className="form-message success" role="status">{notice}</p>}

    {showForm && <section className="panel-card calendar-form-card"><div className="section-heading"><div><h2>{editingId ? 'Edit calendar event' : isAdmin ? 'Add to the office calendar' : 'Schedule a meeting'}</h2><p>{editingId ? 'Administrators can update event details and reminder timing.' : isAdmin ? 'Share holidays, company events, or meetings with everyone.' : 'Meetings are visible to all signed-in users.'}</p></div><button className="text-button" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
      <form className="calendar-form" onSubmit={saveEvent}>
        <label className="field-label">Title<input required minLength="2" maxLength="120" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="field-label">Type<select value={form.type} disabled={!isAdmin} onChange={(event) => setForm({ ...form, type: event.target.value })}>{(isAdmin ? ['holiday', 'event', 'meeting'] : ['meeting']).map((type) => <option value={type} key={type}>{eventLabels[type]}</option>)}</select></label>
        <label className="calendar-all-day"><input type="checkbox" checked={form.allDay} onChange={(event) => setForm({ ...form, allDay: event.target.checked, startAt: event.target.checked ? form.startAt.slice(0, 10) : `${form.startAt.slice(0, 10)}T09:00`, endAt: event.target.checked ? form.endAt.slice(0, 10) : `${form.endAt.slice(0, 10)}T10:00` })} /> All day</label>
        <label className="field-label">Starts<input type={form.allDay ? 'date' : 'datetime-local'} required value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} /></label>
        <label className="field-label">Ends<input type={form.allDay ? 'date' : 'datetime-local'} required min={form.allDay ? form.startAt : undefined} value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} /></label>
        <label className="field-label">Location<input maxLength="200" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Office or meeting link" /></label>
        <label className="field-label">Reminder<select value={form.reminderMinutes} onChange={(event) => setForm({ ...form, reminderMinutes: Number(event.target.value) })}>{reminderOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field-label calendar-description">Details<textarea rows="3" maxLength="2000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : isAdmin ? 'Add event' : 'Schedule meeting'}</button>
      </form>
    </section>}

    <section className="panel-card calendar-panel">
      <div className="calendar-month-heading"><button className="button button-secondary" type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>‹</button><h2>{monthLabel}</h2><button className="button button-secondary" type="button" aria-label="Next month" onClick={() => moveMonth(1)}>›</button><button className="text-button" type="button" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setPage(1) }}>Today</button></div>
      {loading ? <LoadingState label="Loading office calendar" /> : <div className="calendar-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
        {calendarDays.map((date) => {
          const dateKey = getDateKey(date)
          const dayEvents = events.filter((calendarEvent) => getDateKey(new Date(calendarEvent.startAt)) <= dateKey && getDateKey(new Date(calendarEvent.endAt)) >= dateKey)
          return <div className={`calendar-day ${date.getMonth() !== month.getMonth() ? 'is-outside-month' : ''}`} key={dateKey}>
            <span className="calendar-day-number">{date.getDate()}</span>
            <div className="calendar-day-events">{dayEvents.slice(0, 3).map((calendarEvent) => <span className={`calendar-event-chip event-${calendarEvent.type}`} key={calendarEvent._id} title={`${eventLabels[calendarEvent.type]}: ${calendarEvent.title}`}>{calendarEvent.title}</span>)}{dayEvents.length > 3 && <small>+{dayEvents.length - 3} more</small>}</div>
          </div>
        })}
      </div>}
    </section>

    <section className="panel-card calendar-agenda"><div className="section-heading"><div><h2>Events this month</h2><p>{pagination?.totalItems ?? events.length} scheduled items</p></div><button className="text-button" type="button" onClick={loadEvents} disabled={loading}>Refresh</button></div>
      {!loading && events.length === 0 ? <p className="user-table-state">No office events are scheduled for this month.</p> : <div className="calendar-event-list">{events.map((event) => <article className={`calendar-event-card event-${event.type}`} key={event._id}>
        <div className="calendar-event-date"><strong>{new Intl.DateTimeFormat(undefined, { day: '2-digit' }).format(new Date(event.startAt))}</strong><span>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(event.startAt))}</span></div>
        <div className="calendar-event-details"><span className="calendar-event-type">{eventLabels[event.type]}</span><h3>{event.title}</h3><p>{event.description || 'No additional details.'}</p><div className="work-meta"><span>{event.allDay ? 'All day' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.startAt))}</span>{event.location && <span>{event.location}</span>}<span>Scheduled by {event.createdBy?.name || 'Orbit user'}</span></div></div>
        {isAdmin && <div className="calendar-admin-actions"><button className="text-button" type="button" onClick={() => beginEdit(event)}>Edit</button><button className="text-button danger-text" type="button" onClick={() => removeEvent(event)} disabled={busy}>Remove</button></div>}
      </article>)}</div>}
      <Pagination pagination={pagination} onPageChange={setPage} disabled={loading} />
    </section>
  </main><Footer /></section>
}

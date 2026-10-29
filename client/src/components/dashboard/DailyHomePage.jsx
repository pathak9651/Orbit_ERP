import { useCallback, useEffect, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import LoadingState from '../common/LoadingState.jsx'
import { getHomeSummary } from '../../services/api.js'

const ROLE_LABELS = { admin: 'Administrator', hr: 'Human resources', manager: 'Department manager', employee: 'Employee', accountant: 'Accounts', housekeeping: 'Housekeeping' }

function getGreeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

function formatDate(value, timeZone, withTime = false) {
  return new Intl.DateTimeFormat(undefined, withTime
    ? { dateStyle: 'medium', timeStyle: 'short', timeZone }
    : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone }).format(new Date(value))
}

function formatClock(value, timeZone) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(value))
}

function getRoleMessage(role) {
  if (role === 'manager') return 'Your department’s work, attendance, and approvals in one place.'
  if (role === 'hr') return 'A clear view of people activity, upcoming events, and requests to review.'
  if (role === 'accountant') return 'Your workday and company updates, with finance tools close at hand.'
  if (role === 'admin') return 'Company activity and the work that needs your attention.'
  return 'Your workday, attendance, and team updates in one place.'
}

function SummaryCard({ label, value, detail, icon, tone }) {
  return <article className={`daily-summary-card tone-${tone}`}>
    <div className="daily-summary-top"><span>{label}</span><span className="daily-summary-icon" aria-hidden="true">{icon}</span></div>
    <strong>{value}</strong>
    <small>{detail}</small>
  </article>
}

function QuickLink({ icon, title, detail, onClick }) {
  return <button type="button" className="daily-quick-link" onClick={onClick}>
    <span className="daily-quick-icon" aria-hidden="true">{icon}</span>
    <span><strong>{title}</strong><small>{detail}</small></span>
    <span className="daily-quick-arrow" aria-hidden="true">↗</span>
  </button>
}

/** Gives every employee a personal daily briefing backed by role-scoped ERP records. */
export default function DailyHomePage({ user, message, onNavigate, onOpenNotification }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async (isCurrent = () => true) => {
    setLoading(true)
    try {
      const result = await getHomeSummary()
      if (isCurrent()) { setSummary(result); setError('') }
    } catch (loadError) {
      if (isCurrent()) setError(loadError.message || 'Could not load your workspace summary.')
    } finally { if (isCurrent()) setLoading(false) }
  }, [])

  useEffect(() => {
    let active = true
    refresh(() => active)
    return () => { active = false }
  }, [refresh, user?.id])

  const navigate = (page) => onNavigate?.(page)
  const firstName = user.name?.trim().split(/\s+/)[0] || 'there'
  const roleLabel = ROLE_LABELS[user.role] || user.roleName || user.role || 'Team member'
  const attendance = summary?.today.attendance
  const attendanceState = !summary ? '—' : attendance?.checkOut ? 'Day completed' : attendance?.checkIn ? 'Checked in' : 'Not checked in'
  const attendanceDetail = attendance?.checkOut
    ? `Checked out at ${formatClock(attendance.checkOut, summary.today.timeZone)}`
    : attendance?.checkIn
      ? `Since ${formatClock(attendance.checkIn, summary.today.timeZone)}`
      : 'Record your arrival when you start'
  const totalTasks = summary?.tasks.total || 0
  const completionWidth = `${summary?.tasks.completionRate || 0}%`
  const isApprover = ['admin', 'hr', 'manager'].includes(user.role)
  const taskHeading = ['admin', 'hr', 'manager'].includes(user.role) ? 'Team work in progress' : 'Your task focus'

  return <section className="main-panel daily-home-page" id="overview">
    <main className="dashboard-content daily-home-content">
      {(message || error) && <p className="form-message error" role="alert">{message || error}</p>}
      <section className="daily-hero">
        <div className="daily-hero-copy">
          <div className="daily-overline"><span className="daily-live-dot" /> YOUR ORBIT WORKSPACE <span className="daily-overline-divider">/</span> {roleLabel.toUpperCase()}</div>
          <h1>{getGreeting()}, {firstName}<span className="daily-greeting-mark" aria-hidden="true">✦</span></h1>
          <p>{getRoleMessage(user.role)}</p>
          <div className="daily-hero-meta"><span>{summary ? formatDate(`${summary.today.dateKey}T12:00:00Z`, summary.today.timeZone) : formatDate(new Date(), undefined)}</span>{summary?.organization.department && <><i /> <span>{summary.organization.department} team</span></>}</div>
          <div className="daily-hero-actions"><button className="button button-primary" type="button" onClick={() => navigate('tasks')}>Open {['admin', 'hr', 'manager'].includes(user.role) ? 'task management' : 'my tasks'} <span aria-hidden="true">→</span></button><button className="button button-secondary" type="button" onClick={() => navigate('attendance')}>Attendance</button></div>
        </div>
        <div className="daily-hero-art" aria-hidden="true"><div className="daily-hero-orbit orbit-one" /><div className="daily-hero-orbit orbit-two" /><div className="daily-hero-core">O</div><span className="daily-hero-spark spark-one">✦</span><span className="daily-hero-spark spark-two">·</span><span className="daily-hero-coordinate">ORBIT / ERP</span></div>
        <div className="daily-hero-role">{user.department?.name || summary?.organization.department || roleLabel}<small>{user.role === 'manager' ? 'Team workspace' : 'Company workspace'}</small></div>
      </section>

      <div className="daily-summary-grid" aria-label="Your workspace summary">
        <SummaryCard label="Open work" value={summary ? summary.tasks.open : '—'} detail={summary ? `${summary.tasks.completed} completed of ${totalTasks} visible tasks` : 'Work summary unavailable'} icon="TK" tone="blue" />
        <SummaryCard label="Today’s attendance" value={attendanceState} detail={summary ? attendanceDetail : 'Attendance summary unavailable'} icon="AT" tone={attendance?.checkOut ? 'green' : attendance?.checkIn ? 'cyan' : 'amber'} />
        <SummaryCard label="My leave requests" value={summary ? summary.leaves.pending : '—'} detail={summary ? `${summary.leaves.approved} approved · ${summary.leaves.total} total` : 'Leave summary unavailable'} icon="LV" tone="violet" />
        <SummaryCard label={isApprover ? 'Waiting for your review' : 'Unread updates'} value={summary ? (isApprover ? summary.leaves.pendingForReview : summary.notifications.unreadCount) : '—'} detail={summary ? isApprover ? 'Leave requests in your approval queue' : 'New notices from your workspace' : 'Updates summary unavailable'} icon={isApprover ? '!' : '•'} tone="amber" />
      </div>

      {isApprover && summary?.leaves.pendingForReview > 0 && <button className="daily-approval-banner" type="button" onClick={() => navigate('leaves')}><span className="daily-approval-indicator">{summary.leaves.pendingForReview}</span><span><strong>Requests need your attention</strong><small>Open the leave queue to review and move requests forward.</small></span><span className="daily-quick-arrow" aria-hidden="true">→</span></button>}

      <div className="daily-content-grid">
        <section className="panel-card daily-focus-panel">
          <div className="daily-panel-heading"><div><span className="daily-section-kicker">FOCUS</span><h2>{taskHeading}</h2><p>{totalTasks ? `${summary?.tasks.open || 0} open tasks across your accessible work` : 'A short view of the work you can access.'}</p></div><button type="button" className="text-button" onClick={() => navigate('tasks')}>View tasks <span aria-hidden="true">→</span></button></div>
          {loading && !summary ? <LoadingState label="Loading your tasks" /> : !summary ? <p className="daily-compact-empty">Your task summary is unavailable. Use Refresh dashboard to try again.</p> : summary.tasks.focus.length ? <div className="daily-task-list">{summary.tasks.focus.slice(0, 4).map((task) => <button className="daily-task-row" key={task._id} type="button" onClick={() => navigate('tasks')}>
            <span className={`daily-task-state task-${task.status}`} aria-hidden="true">{task.status === 'in-progress' ? '↗' : '·'}</span>
            <span className="daily-task-copy"><strong>{task.title}</strong><small>{task.assignedTo?.name ? `Assigned to ${task.assignedTo.name}` : 'Assigned to you'}{task.department?.name ? ` · ${task.department.name}` : ''}</small></span>
            <span className="daily-task-due">{task.dueDate ? formatDate(task.dueDate, summary.today.timeZone) : task.status.replaceAll('-', ' ')}</span>
          </button>)}</div> : <div className="daily-empty-state"><span aria-hidden="true">✓</span><strong>You’re clear for now</strong><p>No open tasks are waiting in the work queue visible to you.</p></div>}
          <div className="daily-progress-row"><div><span>Task completion</span><strong>{summary?.tasks.completionRate || 0}%</strong></div><div className="daily-progress-track"><span style={{ width: completionWidth }} /></div></div>
        </section>

        <section className="panel-card daily-attendance-panel">
          <div className="daily-panel-heading"><div><span className="daily-section-kicker">YOUR DAY</span><h2>Attendance</h2><p>{summary ? summary.today.dateKey : 'Today'}</p></div><span className={`daily-attendance-status ${attendance?.checkOut ? 'is-complete' : attendance?.checkIn ? 'is-checked-in' : ''}`}><i />{loading && !summary ? 'Loading' : attendanceState}</span></div>
          <div className="daily-attendance-times"><div><span>Check in</span><strong>{attendance?.checkIn ? formatClock(attendance.checkIn, summary.today.timeZone) : '—'}</strong></div><div><span>Check out</span><strong>{attendance?.checkOut ? formatClock(attendance.checkOut, summary.today.timeZone) : '—'}</strong></div></div>
          <button className="daily-inline-action" type="button" onClick={() => navigate('attendance')}>{attendance?.checkIn && !attendance.checkOut ? 'Complete your day' : attendance?.checkOut ? 'Review attendance' : 'Open attendance'} <span aria-hidden="true">→</span></button>
        </section>

        <section className="panel-card daily-calendar-panel">
          <div className="daily-panel-heading"><div><span className="daily-section-kicker">ON THE CALENDAR</span><h2>Coming up</h2><p>Upcoming office events and meetings</p></div><button type="button" className="text-button" onClick={() => navigate('calendar')}>Calendar <span aria-hidden="true">→</span></button></div>
          {loading && !summary ? <LoadingState label="Loading calendar" /> : !summary ? <div className="daily-compact-empty">Your calendar summary is unavailable.</div> : summary.calendar.length ? <div className="daily-event-list">{summary.calendar.map((event) => <button className="daily-event-row" key={event._id} type="button" onClick={() => navigate('calendar')}>
            <span className="daily-event-date"><strong>{new Intl.DateTimeFormat(undefined, { day: '2-digit', timeZone: summary.today.timeZone }).format(new Date(event.startAt))}</strong><small>{new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: summary.today.timeZone }).format(new Date(event.startAt))}</small></span>
            <span><strong>{event.title}</strong><small>{event.type}{event.location ? ` · ${event.location}` : ''}</small></span>
            <span className="daily-event-time">{event.allDay ? 'All day' : formatClock(event.startAt, summary.today.timeZone)}</span>
          </button>)}</div> : <div className="daily-compact-empty">Nothing scheduled next. New meetings and office events will appear here.</div>}
        </section>

        <section className="panel-card daily-updates-panel">
          <div className="daily-panel-heading"><div><span className="daily-section-kicker">LATEST</span><h2>Workspace updates</h2><p>{summary?.notifications.unreadCount ? `${summary.notifications.unreadCount} unread update${summary.notifications.unreadCount === 1 ? '' : 's'}` : 'Recent notices relevant to you'}</p></div></div>
          {loading && !summary ? <LoadingState label="Loading updates" /> : !summary ? <div className="daily-compact-empty">Your updates are unavailable.</div> : summary.notifications.recent.length ? <div className="daily-notification-list">{summary.notifications.recent.slice(0, 4).map((notification) => <button className={`daily-notification-row ${notification.readAt ? '' : 'is-unread'}`} key={notification.id} type="button" onClick={() => onOpenNotification ? onOpenNotification(notification) : navigate(notification.page || 'overview')}>
            <span className="daily-notification-dot" aria-hidden="true" />
            <span><strong>{notification.title}</strong><small>{notification.message}</small></span>
            <time dateTime={notification.createdAt}>{new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: summary.today.timeZone }).format(new Date(notification.createdAt))}</time>
          </button>)}</div> : <div className="daily-compact-empty">No new updates yet. Notifications for tasks, leave, and company activity show up here.</div>}
        </section>
      </div>

      <section className="daily-shortcuts-section">
        <div className="daily-panel-heading"><div><span className="daily-section-kicker">SHORTCUTS</span><h2>Go to what you need</h2></div><button className="text-button" type="button" onClick={() => refresh()}>Refresh dashboard <span aria-hidden="true">↻</span></button></div>
        <div className="daily-shortcuts">
          <QuickLink icon="TK" title={['admin', 'hr', 'manager'].includes(user.role) ? 'Task management' : 'My tasks'} detail="Review assignments and progress" onClick={() => navigate('tasks')} />
          <QuickLink icon="LV" title="Leave requests" detail={isApprover ? 'Review or follow requests' : 'Apply and follow approvals'} onClick={() => navigate('leaves')} />
          <QuickLink icon="CH" title="Team chat" detail="Message colleagues and departments" onClick={() => navigate('chat')} />
          <QuickLink icon="CA" title="Office calendar" detail="See events, holidays, and meetings" onClick={() => navigate('calendar')} />
        </div>
      </section>
    </main>
    <Footer />
  </section>
}

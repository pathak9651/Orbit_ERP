import { useEffect, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import LoadingState from '../common/LoadingState.jsx'
import { getAdminOverview } from '../../services/api.js'

/** Provides date strings for the browser's local calendar without a UTC date shift. */
function localDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Formats invoice amounts using the currency stored by the billing system. */
function money(value, currency = 'INR') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value || 0)
}

/** Formats audit timestamps for the administrator's recent activity list. */
function formatActivityDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

/** Displays one actual database-derived KPI with its reporting context. */
function OverviewMetric({ label, value, note, tone = 'green' }) {
  return <article className="overview-metric panel-card"><span className="overview-metric-label">{label}</span><strong className={`overview-metric-value tone-${tone}`}>{value}</strong><span className="overview-metric-note">{note}</span></article>
}

/** Presents company-wide people, operations, attendance, and billing metrics to administrators. */
export default function AdminOverviewPage() {
  const today = new Date()
  const [filters, setFilters] = useState({ startDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, endDate: localDateKey(today), departmentId: 'all', location: 'all' })
  const [appliedFilters, setAppliedFilters] = useState(filters)
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCurrentRequest = true
    setIsLoading(true)
    setError('')
    getAdminOverview(appliedFilters)
      .then((result) => { if (isCurrentRequest) setOverview(result) })
      .catch((requestError) => { if (isCurrentRequest) setError(requestError.message || 'Could not load company overview.') })
      .finally(() => { if (isCurrentRequest) setIsLoading(false) })
    return () => { isCurrentRequest = false }
  }, [appliedFilters])

  function updateFilter(event) {
    const { name, value } = event.target
    setFilters((current) => ({ ...current, [name]: value }))
  }

  const alerts = overview ? [
    overview.employees.pendingApprovals > 0 && `${overview.employees.pendingApprovals} account${overview.employees.pendingApprovals === 1 ? '' : 's'} awaiting approval`,
    overview.leave.pendingRequests > 0 && `${overview.leave.pendingRequests} leave request${overview.leave.pendingRequests === 1 ? '' : 's'} awaiting review`,
    overview.tasks.overdue > 0 && `${overview.tasks.overdue} overdue task${overview.tasks.overdue === 1 ? '' : 's'}`,
    overview.invoices.overdueTotal > 0 && `${money(overview.invoices.overdueTotal)} in overdue invoices`,
  ].filter(Boolean) : []

  return (
    <section className="main-panel" id="overview">
      <main className="dashboard-content admin-overview-content">
        <div className="page-heading admin-overview-heading">
          <div><span className="eyebrow">COMPANY OVERVIEW</span><h1>Company overview</h1><p>Current account status and operational activity for the selected reporting period.</p></div>
          {overview && <span className="overview-timezone">Workplace time: {overview.period.timeZone}</span>}
        </div>

        <form className="overview-filters panel-card" onSubmit={(event) => { event.preventDefault(); setAppliedFilters({ ...filters }) }} aria-label="Company overview filters">
          <label className="field-label">From<input type="date" name="startDate" value={filters.startDate} max={filters.endDate} onChange={updateFilter} /></label>
          <label className="field-label">To<input type="date" name="endDate" value={filters.endDate} min={filters.startDate} onChange={updateFilter} /></label>
          <label className="field-label">Department<select name="departmentId" value={filters.departmentId} onChange={updateFilter}><option value="all">All departments</option>{(overview?.filters.departments || []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label className="field-label">Attendance location<select name="location" value={filters.location} onChange={updateFilter}><option value="all">All check-ins</option><option value="gps-recorded">GPS recorded</option><option value="gps-unavailable">GPS unavailable</option>{overview?.filters.geofenceConfigured && <><option value="inside-site">Inside workplace radius</option><option value="outside-site">Outside workplace radius</option></>}</select></label>
          <button className="button button-primary overview-apply-button" type="submit" disabled={isLoading}>Apply filters</button>
        </form>

        {error && <p className="form-message error" role="alert">{error}</p>}
        {isLoading && !overview && <LoadingState label="Loading company records" />}
        {overview && <>
          <section className="overview-section" aria-labelledby="people-heading">
            <div className="section-heading"><div><h2 id="people-heading">People</h2><p>Current account snapshot{overview.filters.selectedDepartment ? ` · ${overview.filters.selectedDepartment.name}` : ' · All departments'}</p></div></div>
            <div className="overview-metric-grid">
              <OverviewMetric label="Total employees" value={overview.employees.total} note="Non-admin accounts" tone="blue" />
              <OverviewMetric label="Active employees" value={overview.employees.active} note="Verified accounts" tone="green" />
              <OverviewMetric label="Pending approvals" value={overview.employees.pendingApprovals} note="Awaiting account verification" tone="amber" />
            </div>
          </section>

          <section className="overview-section" aria-labelledby="attendance-heading">
            <div className="section-heading"><div><h2 id="attendance-heading">Attendance</h2><p>{overview.period.startDate} to {overview.period.endDate} · weekdays only for absence estimate</p></div></div>
            <div className="overview-metric-grid overview-four-columns">
              <OverviewMetric label="Present workdays" value={overview.attendance.presentDays} note="Recorded check-ins" tone="green" />
              <OverviewMetric label="Estimated absent workdays" value={overview.attendance.absentDays} note="Weekends excluded; holidays not configured" tone="amber" />
              <OverviewMetric label="Late check-ins" value={overview.attendance.lateCheckIns} note={`After ${overview.attendance.lateAfter} ${overview.period.timeZone}`} tone="violet" />
              <OverviewMetric label="Approved leave workdays" value={overview.attendance.onLeaveDays} note="Approved leave overlapping period" tone="blue" />
            </div>
            <p className="overview-context-note">Attendance location filter matches {overview.attendance.locationMatchedCheckIns} check-in record{overview.attendance.locationMatchedCheckIns === 1 ? '' : 's'}. GPS/geofence filters do not change absence totals.</p>
          </section>

          <section className="overview-section" aria-labelledby="tasks-heading">
            <div className="section-heading"><div><h2 id="tasks-heading">Work and approvals</h2><p>Tasks created during the selected period; overdue means due before now and not completed.</p></div></div>
            <div className="overview-metric-grid overview-four-columns">
              <OverviewMetric label="Tasks created" value={overview.tasks.total} note="In selected date range" tone="blue" />
              <OverviewMetric label="Completed tasks" value={overview.tasks.completed} note="Completed status" tone="green" />
              <OverviewMetric label="Open tasks" value={overview.tasks.open} note="Pending or in progress" tone="violet" />
              <OverviewMetric label="Overdue tasks" value={overview.tasks.overdue} note="Open and past due" tone="amber" />
            </div>
            <div className="overview-two-column">
              <section className="panel-card overview-list-panel"><h3>Department workload</h3>{Object.entries(overview.tasks.byDepartment).length ? <ul className="overview-workload-list">{Object.entries(overview.tasks.byDepartment).sort((first, second) => second[1] - first[1]).map(([name, count]) => <li key={name}><span>{name}</span><strong>{count}</strong></li>)}</ul> : <p className="overview-empty-note">No tasks were created in this period.</p>}</section>
              <section className="panel-card overview-list-panel"><h3>Pending approvals</h3><ul className="overview-workload-list"><li><span>Account approvals</span><strong>{overview.employees.pendingApprovals}</strong></li><li><span>Leave requests</span><strong>{overview.leave.pendingRequests}</strong></li></ul></section>
            </div>
          </section>

          <section className="overview-section" aria-labelledby="billing-heading">
            <div className="section-heading"><div><h2 id="billing-heading">Invoices</h2><p>Invoice issue date is within the selected period. Paid status is not a payment-ledger record.</p></div></div>
            <div className="overview-metric-grid overview-four-columns">
              <OverviewMetric label="Invoiced total" value={money(overview.invoices.invoicedTotal, overview.invoices.currency)} note="Sent and paid invoices; excludes drafts/cancelled" tone="blue" />
              <OverviewMetric label="Invoices marked paid" value={money(overview.invoices.paidStatusTotal, overview.invoices.currency)} note={`${overview.invoices.paidCount} invoice${overview.invoices.paidCount === 1 ? '' : 's'} with paid status; not verified collections`} tone="green" />
              <OverviewMetric label="Unpaid invoices" value={money(overview.invoices.unpaidTotal, overview.invoices.currency)} note={`${overview.invoices.unpaidCount} sent or overdue invoices not marked paid`} tone="violet" />
              <OverviewMetric label="Overdue amount" value={money(overview.invoices.overdueTotal, overview.invoices.currency)} note={`${overview.invoices.overdueCount} marked overdue or past due while sent`} tone="amber" />
            </div>
            <div className="overview-two-column overview-secondary-row"><section className="panel-card overview-list-panel"><h3>Expenses</h3><p className="overview-empty-note">Expense records are not tracked in this system, so no expense total is available.</p></section><section className="panel-card overview-list-panel"><h3>Draft invoices</h3><p className="overview-financial-value">{money(overview.invoices.draftTotal, overview.invoices.currency)}</p><p className="overview-empty-note">Draft value is excluded from invoiced totals.</p></section></div>
          </section>

          <section className="overview-two-column overview-bottom-panels">
            <section className="panel-card overview-list-panel"><div className="overview-panel-heading"><div><h2>Alerts</h2><p>Items that may need administrator attention.</p></div></div>{alerts.length ? <ul className="overview-alert-list">{alerts.map((alert) => <li key={alert}><span className="overview-alert-dot" />{alert}</li>)}</ul> : <p className="overview-empty-note">No pending approvals or overdue items in the current overview.</p>}</section>
            <section className="panel-card overview-list-panel"><div className="overview-panel-heading"><div><h2>Recent activity</h2><p>Security and account events in this reporting period.</p></div></div>{overview.recentActivities.length ? <ul className="overview-activity-list">{overview.recentActivities.map((activity) => <li key={activity.id}><span className="activity-status-dot" /><div><strong>{activity.actor}</strong><span>{activity.type.replaceAll('_', ' ')} · {activity.outcome}</span><time dateTime={activity.createdAt}>{formatActivityDate(activity.createdAt)}</time></div></li>)}</ul> : <p className="overview-empty-note">No audit events recorded in this period.</p>}</section>
          </section>
        </>}
      </main>
      <Footer />
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import LoadingState from '../common/LoadingState.jsx'
import { getAdminReports } from '../../services/api.js'

const PERIOD_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

const COLLECTION_LABELS = {
  User: 'Employee accounts', Task: 'Tasks', Attendance: 'Attendance records', LeaveRequest: 'Leave requests',
  Invoice: 'Invoices', Customer: 'CRM customers', InventoryItem: 'Inventory items', Document: 'Documents',
  EmailLog: 'Emails', ChatMessage: 'Chat messages', ChatConversation: 'Chat conversations', CalendarEvent: 'Calendar events',
  Notification: 'Notifications', AuditEvent: 'Audit events', Role: 'Roles', Department: 'Departments',
}

const METRIC_LABELS = {
  'Employees added': 'Employees added', 'Tasks created': 'Tasks created', 'Attendance check-ins': 'Attendance check-ins',
  'Leave requests': 'Leave requests created', 'Invoices created': 'Invoices created', 'Customers added': 'Customers added',
  'Inventory items added': 'Inventory items added', 'Documents uploaded': 'Documents uploaded', 'Emails sent': 'Emails sent',
  'Chat messages': 'Chat messages', 'Chat conversations opened': 'Chat conversations opened', 'Calendar events added': 'Calendar events added',
  Notifications: 'Notifications created', 'Audit events': 'Audit events',
}

const numberFormat = new Intl.NumberFormat()
const moneyFormat = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** Draws an accessible SVG column chart for the selected reporting metric. */
function ReportBarChart({ title, values }) {
  const chartWidth = 850
  const chartHeight = 250
  const left = 42
  const right = 12
  const top = 18
  const bottom = 42
  const plotWidth = chartWidth - left - right
  const plotHeight = chartHeight - top - bottom
  const maximum = Math.max(1, ...values.map((point) => point.count))
  const slotWidth = plotWidth / Math.max(values.length, 1)
  const barWidth = Math.max(3, Math.min(25, slotWidth * 0.62))
  const labelInterval = values.length > 21 ? 4 : values.length > 12 ? 2 : 1

  return <section className="panel-card report-chart-card">
    <div className="section-heading"><div><h2>{title}</h2><p>Records counted in each interval</p></div></div>
    <div className="report-chart-scroll"><svg className="report-bar-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${title} bar chart`}>
      {[0, 0.5, 1].map((ratio) => {
        const y = top + plotHeight * (1 - ratio)
        return <g key={ratio}><line x1={left} x2={chartWidth - right} y1={y} y2={y} className="report-chart-gridline" /><text x={left - 8} y={y + 4} textAnchor="end" className="report-chart-axis-label">{Math.round(maximum * ratio)}</text></g>
      })}
      {values.map((point, index) => {
        const height = (point.count / maximum) * plotHeight
        const x = left + slotWidth * index + (slotWidth - barWidth) / 2
        const y = top + plotHeight - height
        return <g key={point.dateKey}>
          <rect x={x} y={y} width={barWidth} height={Math.max(point.count ? 2 : 0, height)} rx="3" className="report-chart-bar"><title>{point.label}: {numberFormat.format(point.count)}</title></rect>
          {(index % labelInterval === 0 || index === values.length - 1) && <text x={left + slotWidth * index + slotWidth / 2} y={chartHeight - 15} textAnchor="middle" className="report-chart-axis-label">{point.label}</text>}
        </g>
      })}
    </svg></div>
  </section>
}

/** Shows real company-wide record counts and trends for weekly, monthly, quarterly, and yearly periods. */
export default function AdminReportsPage() {
  const [period, setPeriod] = useState('monthly')
  const [asOfDate, setAsOfDate] = useState('')
  const [metric, setMetric] = useState('Attendance check-ins')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    const parameters = { period, ...(asOfDate ? { asOfDate } : {}) }
    getAdminReports(parameters)
      .then((result) => { if (active) { setReport(result); setError('') } })
      .catch((requestError) => { if (active) setError(requestError.message || 'Could not load company reports.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [period, asOfDate])

  const availableMetrics = useMemo(() => Object.keys(report?.trends || {}), [report])
  const selectedValues = report?.trends?.[metric] || []
  const totalAttendance = (report?.trends?.['Attendance check-ins'] || []).reduce((sum, entry) => sum + entry.count, 0)
  const sortedCollections = [...(report?.collections || [])].sort((first, second) => second.total - first.total)

  return <section className="main-panel admin-reports-page">
    <main className="dashboard-content">
      <div className="page-heading reports-heading">
        <div><span className="eyebrow">ADMINISTRATION</span><h1>Company reports</h1><p>Analyze real company records across workforce, operations, communication, finance, and resources.</p></div>
        <div className="report-period-controls">
          <label>Reporting period<select value={period} onChange={(event) => setPeriod(event.target.value)}>{PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Period date<input type="date" value={asOfDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setAsOfDate(event.target.value)} /></label>
          {asOfDate && <button className="text-button report-reset-date" type="button" onClick={() => setAsOfDate('')}>Current period</button>}
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && !report ? <LoadingState label="Preparing company reports" /> : report && <>
        <p className="report-date-range">{report.period.startDate} – {report.period.endDate} <span>Company time zone: {report.period.timeZone}</span></p>
        <div className="report-kpi-grid">
          <article className="panel-card"><span>Employees</span><strong>{numberFormat.format(report.workforce.totalEmployees)}</strong><small>{numberFormat.format(report.workforce.activeEmployees)} active · {numberFormat.format(report.workforce.pendingApprovals)} pending approval</small></article>
          <article className="panel-card"><span>Attendance</span><strong>{numberFormat.format(totalAttendance)}</strong><small>Check-ins in this reporting period</small></article>
          <article className="panel-card"><span>Tasks completed</span><strong>{numberFormat.format(report.tasks.completed)}</strong><small>{numberFormat.format(report.tasks.pending + report.tasks.inProgress)} currently open</small></article>
          <article className="panel-card"><span>Leave requests</span><strong>{numberFormat.format(report.leaves.total)}</strong><small>{numberFormat.format(report.leaves.pending)} pending · {numberFormat.format(report.leaves.approved)} approved</small></article>
          <article className="panel-card"><span>Paid invoice status total</span><strong>{moneyFormat.format(report.invoices.paidInvoiceTotal)}</strong><small>{numberFormat.format(report.invoices.paid)} invoices marked paid</small></article>
          <article className="panel-card"><span>Inventory alerts</span><strong>{numberFormat.format(report.inventory.lowStock + report.inventory.outOfStock)}</strong><small>{numberFormat.format(report.inventory.lowStock)} low · {numberFormat.format(report.inventory.outOfStock)} out of stock</small></article>
        </div>

        <div className="report-chart-controls">
          <label>Chart metric<select value={availableMetrics.includes(metric) ? metric : availableMetrics[0] || ''} onChange={(event) => setMetric(event.target.value)}>{availableMetrics.map((name) => <option key={name} value={name}>{METRIC_LABELS[name] || name}</option>)}</select></label>
        </div>
        <ReportBarChart title={METRIC_LABELS[metric] || metric} values={selectedValues} />

        <section className="panel-card report-collection-card">
          <div className="section-heading"><div><h2>Company records</h2><p>Current record totals across every reportable ERP collection</p></div></div>
          <div className="report-collection-grid">{sortedCollections.map(({ collection, total }) => <article className="report-collection-item" key={collection}>
            <span>{COLLECTION_LABELS[collection] || collection}</span><strong>{numberFormat.format(total)}</strong>
            <div className="report-collection-track"><span style={{ width: `${Math.max(total ? 2 : 0, (total / Math.max(sortedCollections[0]?.total || 1, 1)) * 100)}%` }} /></div>
          </article>)}</div>
        </section>

        <div className="report-status-grid">
          <section className="panel-card"><h2>Task status</h2><p>Current status of all assigned work</p><dl><div><dt>Pending</dt><dd>{numberFormat.format(report.tasks.pending)}</dd></div><div><dt>In progress</dt><dd>{numberFormat.format(report.tasks.inProgress)}</dd></div><div><dt>Completed</dt><dd>{numberFormat.format(report.tasks.completed)}</dd></div></dl></section>
          <section className="panel-card"><h2>Invoice status</h2><p>Invoice values by current status</p><dl><div><dt>Sent and overdue</dt><dd>{moneyFormat.format(report.invoices.unpaidInvoiceTotal)}</dd></div><div><dt>Paid status</dt><dd>{moneyFormat.format(report.invoices.paidInvoiceTotal)}</dd></div><div><dt>Draft</dt><dd>{numberFormat.format(report.invoices.draft)}</dd></div></dl><small>Invoice status is shown; payment transactions are not separately tracked.</small></section>
          <section className="panel-card"><h2>Leave status</h2><p>Current company leave request totals</p><dl><div><dt>Pending</dt><dd>{numberFormat.format(report.leaves.pending)}</dd></div><div><dt>Approved</dt><dd>{numberFormat.format(report.leaves.approved)}</dd></div><div><dt>Rejected</dt><dd>{numberFormat.format(report.leaves.rejected)}</dd></div></dl></section>
        </div>
      </>}
    </main>
    <Footer />
  </section>
}

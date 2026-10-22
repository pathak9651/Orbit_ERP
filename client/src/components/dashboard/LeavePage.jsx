import { useCallback, useEffect, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import { actOnLeaveRequest, createLeaveRequest, getAdminApprovedLeaves, getLeaveRequests } from '../../services/api.js'

const leaveTypeNames = { annual: 'Annual leave', sick: 'Sick leave', personal: 'Personal leave', unpaid: 'Unpaid leave' }
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`)) : '—'
const stageName = (value) => ({ manager: 'Manager', hr: 'HR', admin: 'Admin' }[value] || 'Complete')

function LeaveCard({ request, queued, role, onAction, busy }) {
  const [message, setMessage] = useState('')
  const canForward = queued && ['manager', 'hr'].includes(role)
  const canDecide = queued && role === 'admin'
  return <article className="leave-card">
    <div className="leave-card-heading"><div><h3>{queued ? request.requester?.name : 'Your request'} · {leaveTypeNames[request.leaveType] || request.leaveType}</h3><p>{formatDate(request.startDate)} – {formatDate(request.endDate)}{request.department?.name ? ` · ${request.department.name}` : ''}</p></div><span className={`leave-state leave-${request.status}`}>{request.status === 'pending' ? `Pending ${stageName(request.currentStage)}` : request.status}</span></div>
    {queued && <p className="leave-requester-email">{request.requester?.email} · {request.requester?.role}</p>}
    <p className="leave-reason">{request.reason}</p>
    {request.history?.length > 0 && <details className="leave-history"><summary>Approval history ({request.history.length})</summary><ol>{request.history.map((item, index) => <li key={`${item.createdAt}-${index}`}><strong>{item.actor?.name || item.actorRole}</strong><span>{item.action === 'submitted' ? 'submitted' : item.action === 'forwarded' ? `forwarded to ${item.actorRole === 'manager' ? 'HR' : 'Admin'}` : item.action}</span>{item.message && <p>{item.message}</p>}</li>)}</ol></details>}
    {(canForward || canDecide) && <div className="leave-review-actions"><label className="field-label">{canForward ? 'Suggestion for the next reviewer' : 'Decision note'}<textarea rows="2" maxLength="1000" value={message} onChange={(event) => setMessage(event.target.value)} placeholder={canForward ? 'Add a note that will be included for the next approver.' : 'Add context for the final decision.'} /></label><div className="leave-action-buttons">{canForward && <button className="button button-primary" type="button" disabled={busy || message.trim().length < 3} onClick={() => onAction(request._id, 'forward', message)}>Forward to {role === 'manager' ? 'HR' : 'Admin'}</button>}{canDecide && <><button className="button button-primary" type="button" disabled={busy} onClick={() => onAction(request._id, 'approve', message)}>Approve</button><button className="button button-secondary" type="button" disabled={busy || message.trim().length < 3} onClick={() => onAction(request._id, 'reject', message)}>Reject</button></>}</div></div>}
  </article>
}

function approvedMonth() {
  const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}`
}

function ApprovedLeaveArchive() {
  const [month, setMonth] = useState(approvedMonth)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const result = await getAdminApprovedLeaves(month); setRecords(result.records || []) }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }, [month])
  useEffect(() => { load() }, [load])
  const approvedAction = (record) => [...(record.history || [])].reverse().find((entry) => entry.action === 'approved')
  const approvedDate = (record) => {
    const timestamp = approvedAction(record)?.createdAt
    return timestamp ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp)) : '—'
  }
  return <section className="panel-card leave-list-card approved-leave-archive">
    <div className="section-heading"><div><h2>Approved leave records</h2><p>{records.length} approved requests overlapping {month}</p></div><label className="field-label archive-month-field">Leave month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></div>
    {error && <p className="form-message error" role="alert">{error}</p>}
    {loading ? <p className="user-table-state">Loading approved records…</p> : records.length === 0 ? <p className="user-table-state">No approved leave records for this month.</p> : <div className="attendance-table-wrap"><table className="work-table approved-leave-table"><thead><tr><th>Employee</th><th>Job role</th><th>Department</th><th>Leave type</th><th>Leave dates</th><th>Approved by</th><th>Approved on</th></tr></thead><tbody>{records.map((record) => {
      const approval = approvedAction(record)
      return <tr key={record._id}><td><strong>{record.requester?.name || 'Unknown'}</strong><small>{record.requester?.email}</small></td><td>{record.requester?.role || '—'}</td><td>{record.department?.name || 'Unassigned'}</td><td>{leaveTypeNames[record.leaveType] || record.leaveType}</td><td>{formatDate(record.startDate)} – {formatDate(record.endDate)}</td><td>{approval?.actor?.name || '—'}</td><td>{approvedDate(record)}</td></tr>
    })}</tbody></table></div>}
  </section>
}
export default function LeavePage({ user }) {
  const [data, setData] = useState({ requests: [], queue: [] })
  const [form, setForm] = useState({ leaveType: 'annual', startDate: '', endDate: '', reason: '' })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try { setData(await getLeaveRequests()) }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function submitRequest(event) {
    event.preventDefault(); setSubmitting(true); setError(''); setNotice('')
    try {
      const result = await createLeaveRequest(form)
      setForm({ leaveType: 'annual', startDate: '', endDate: '', reason: '' })
      setNotice(result.message)
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setSubmitting(false) }
  }

  async function handleAction(id, action, message) {
    setBusyId(id); setError(''); setNotice('')
    try {
      const result = await actOnLeaveRequest(id, action, message)
      setNotice(result.message)
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setBusyId('') }
  }

  return <section className="main-panel"><main className="dashboard-content work-page-content leave-page-content">
    <div className="page-heading"><div><span className="eyebrow">WORKSPACE</span><h1>Leave requests</h1><p>Apply for leave and follow each approval step.</p></div></div>
    {error && <p className="form-message error" role="alert">{error}</p>}{notice && <p className="form-message success" role="status">{notice}</p>}
    {user.role !== 'admin' && <section className="panel-card leave-form-card"><div className="section-heading"><div><h2>Apply for leave</h2><p>Requests move upward through the approval hierarchy.</p></div></div>
      <form className="leave-form" onSubmit={submitRequest}>
        <label className="field-label">Leave type<select value={form.leaveType} onChange={(event) => setForm({ ...form, leaveType: event.target.value })}><option value="annual">Annual leave</option><option value="sick">Sick leave</option><option value="personal">Personal leave</option><option value="unpaid">Unpaid leave</option></select></label>
        <label className="field-label">Start date<input type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
        <label className="field-label">End date<input type="date" required min={form.startDate || undefined} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
        <label className="field-label leave-reason-field">Reason<textarea required minLength="3" maxLength="1000" rows="3" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Give the reviewers the context they need." /></label>
        <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit request'}</button>
      </form>
    </section>}

    {['manager', 'hr'].includes(user.role) && <section className="panel-card leave-list-card"><div className="section-heading"><div><h2>Waiting for your review</h2><p>{data.queue?.length || 0} requests in your approval queue</p></div><button className="text-button" type="button" onClick={load}>Refresh</button></div>{loading ? <p className="user-table-state">Loading requests…</p> : !data.queue?.length ? <p className="user-table-state">No requests are waiting for you.</p> : <div className="leave-card-list">{data.queue.map((request) => <LeaveCard key={request._id} request={request} queued role={user.role} onAction={handleAction} busy={busyId === request._id} />)}</div>}</section>}

    {user.role === 'admin' && <section className="panel-card leave-list-card"><div className="section-heading"><div><h2>Final approval queue</h2><p>{data.queue?.length || 0} requests awaiting an admin decision</p></div><button className="text-button" type="button" onClick={load}>Refresh</button></div>{loading ? <p className="user-table-state">Loading requests…</p> : !data.queue?.length ? <p className="user-table-state">No requests are waiting for final approval.</p> : <div className="leave-card-list">{data.queue.map((request) => <LeaveCard key={request._id} request={request} queued role={user.role} onAction={handleAction} busy={busyId === request._id} />)}</div>}</section>}

    {user.role === 'admin' && <ApprovedLeaveArchive />}

    <section className="panel-card leave-list-card"><div className="section-heading"><div><h2>My requests</h2><p>{data.requests?.length || 0} submitted requests</p></div></div>{loading ? <p className="user-table-state">Loading requests…</p> : !data.requests?.length ? <p className="user-table-state">You have not submitted a leave request.</p> : <div className="leave-card-list">{data.requests.map((request) => <LeaveCard key={request._id} request={request} />)}</div>}</section>
  </main><Footer /></section>
}




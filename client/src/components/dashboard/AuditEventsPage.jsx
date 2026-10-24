import { useEffect, useState } from 'react'
import Pagination from '../common/Pagination.jsx'
import { getAuditEvents } from '../../services/api.js'

/** Displays the administrator-readable security log without any mutation controls. */
export default function AuditEventsPage() {
  const [result, setResult] = useState({ events: [], pagination: null })
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getAuditEvents({ page }).then((response) => { if (active) { setResult(response); setError('') } })
      .catch((requestError) => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [page])

  return <section className="main-panel"><main className="profile-content">
    <div className="profile-page-heading"><div><span className="eyebrow">SECURITY</span><h1>Audit events</h1><p>Read-only history for sign-ins, account security, access changes, exports, and invoice approvals.</p></div></div>
    {error && <p className="form-message error" role="alert">{error}</p>}
    <section className="panel-card"><div className="attendance-table-wrap"><table className="work-table"><thead><tr><th>Time</th><th>Event</th><th>Outcome</th><th>Actor</th><th>Target account</th><th>Source IP</th></tr></thead>
      <tbody>{result.events.map((event) => <tr key={event._id}><td>{new Date(event.createdAt).toLocaleString()}</td><td>{event.eventType.replaceAll('_', ' ')}</td><td>{event.outcome}</td><td>{event.actor?.email || 'System / anonymous'}</td><td>{event.targetUser?.email || '—'}</td><td>{event.ipAddress || '—'}</td></tr>)}
        {!result.events.length && <tr><td colSpan="6">No security events recorded yet.</td></tr>}</tbody>
    </table></div><Pagination pagination={result.pagination} onPageChange={setPage} /></section>
  </main></section>
}

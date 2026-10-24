import { useEffect, useMemo, useState } from 'react'
import { getEmailDirectory, getSentEmails, sendWorkspaceEmail } from '../../services/api.js'
import './EmailPage.css'

/** Converts an internal role key into a readable directory label. */
function displayRole(role) {
  return role.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** Displays a sent-email timestamp using the visitor's local date and time format. */
function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Date unavailable'
}

/** Provides the role-aware staff directory and one-to-one or group email form. */
export default function EmailPage({ user }) {
  const [directory, setDirectory] = useState([])
  const [history, setHistory] = useState([])
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function refresh() {
    const [directoryResult, historyResult] = await Promise.all([getEmailDirectory(), getSentEmails()])
    setDirectory(directoryResult.users)
    setHistory(historyResult.emails)
  }

  useEffect(() => {
    let active = true
    Promise.all([getEmailDirectory(), getSentEmails()])
      .then(([directoryResult, historyResult]) => {
        if (!active) return
        setDirectory(directoryResult.users)
        setHistory(historyResult.emails)
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const roles = useMemo(() => [...new Set(directory.map((person) => person.role))].sort(), [directory])
  const departments = useMemo(() => [...new Set(directory.map((person) => person.department).filter(Boolean))].sort(), [directory])
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return directory.filter((person) => (roleFilter === 'all' || person.role === roleFilter)
      && (departmentFilter === 'all' || person.department === departmentFilter)
      && (!query || `${person.name} ${person.email} ${person.role} ${person.department}`.toLowerCase().includes(query)))
  }, [directory, search, roleFilter, departmentFilter])
  const selectedUsers = useMemo(() => directory.filter((person) => selected.includes(person.id)), [directory, selected])

  function togglePerson(id) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function selectVisible() {
    const visibleIds = filteredUsers.map((person) => person.id)
    const allSelected = visibleIds.every((id) => selected.includes(id))
    setSelected((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])])
  }

  function selectAllEmployees() {
    setSelected(directory.filter((person) => person.role !== 'admin').map((person) => person.id))
    setRoleFilter('all')
    setDepartmentFilter('all')
    setSearch('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSending(true)
    try {
      const result = await sendWorkspaceEmail({ recipientIds: selected, subject, message })
      setNotice(result.message)
      setSelected([])
      setSubject('')
      setMessage('')
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSending(false)
    }
  }

  return <main className="workspace-main email-page">
    <div className="page-heading email-page-heading">
      <div><span className="eyebrow">WORKSPACE MESSAGES</span><h1>Email</h1><p>Send a direct message or reach a team with one email.</p></div>
      <div className="email-sender-badge"><span className="avatar avatar-small" aria-hidden="true">{user.name?.[0]?.toUpperCase() || 'U'}</span><span>Sending as<strong>{user.name}</strong></span></div>
    </div>

    {error && <p className="form-error email-feedback" role="alert">{error}</p>}
    {notice && <p className="email-success" role="status">{notice}</p>}

    <form className="email-composer panel-card" onSubmit={handleSubmit}>
      <div className="email-section-heading"><div><h2>Compose email</h2><p>Choose one person, a team, or multiple people.</p></div><span className="email-recipient-count">{selected.length} selected</span></div>
      <div className="email-recipient-toolbar">
        {user.role === 'admin' && <button className="button button-secondary" type="button" onClick={selectAllEmployees} disabled={!directory.length}>All employees</button>}
        <button className="text-button" type="button" onClick={selectVisible} disabled={!filteredUsers.length}>{filteredUsers.length && filteredUsers.every((person) => selected.includes(person.id)) ? 'Clear visible' : 'Select visible'}</button>
        <button className="text-button" type="button" onClick={() => setSelected([])} disabled={!selected.length}>Clear selection</button>
      </div>

      <div className="email-directory-filters">
        <label className="field-label">Find people<input type="search" placeholder="Name, email, role, or department" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="field-label">Role<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option>{roles.map((role) => <option value={role} key={role}>{displayRole(role)}</option>)}</select></label>
        <label className="field-label">Department<select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">All departments</option>{departments.map((department) => <option value={department} key={department}>{department}</option>)}</select></label>
      </div>

      <div className="email-directory" aria-label="Recipient directory">
        {loading ? <p className="email-empty">Loading users…</p> : filteredUsers.length ? filteredUsers.map((person) => <label className={`email-person ${selected.includes(person.id) ? 'is-selected' : ''}`} key={person.id}>
          <input type="checkbox" checked={selected.includes(person.id)} onChange={() => togglePerson(person.id)} />
          <span className="avatar avatar-small" aria-hidden="true">{person.name?.[0]?.toUpperCase() || 'U'}</span>
          <span className="email-person-copy"><strong>{person.name}</strong><span>{person.email}</span></span>
          <span className="email-person-tags"><span>{displayRole(person.role)}</span>{person.department && <span>{person.department}</span>}</span>
        </label>) : <p className="email-empty">No users match these filters.</p>}
      </div>

      {selectedUsers.length > 0 && <div className="email-selected-summary" aria-live="polite"><strong>To ({selectedUsers.length})</strong><span>{selectedUsers.slice(0, 4).map((person) => person.name).join(', ')}{selectedUsers.length > 4 ? ` and ${selectedUsers.length - 4} more` : ''}</span></div>}

      <label className="field-label email-subject-field">Subject<input type="text" maxLength={180} required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What is this email about?" /></label>
      <label className="field-label email-message-field">Message<textarea maxLength={20000} required rows={8} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write your message…" /></label>
      <div className="email-compose-footer"><span>{message.length.toLocaleString()} / 20,000 characters · Recipients are hidden from one another.</span><button className="button button-primary" type="submit" disabled={sending || !selected.length || loading}>{sending ? 'Sending…' : `Send email${selected.length ? ` to ${selected.length}` : ''}`}</button></div>
    </form>

    <section className="panel-card email-history-card"><div className="email-section-heading"><div><h2>{user.role === 'admin' ? 'Email activity' : 'Your sent emails'}</h2><p>{user.role === 'admin' ? 'Recent delivery records across the workspace.' : 'Your recent email delivery records.'}</p></div></div>
      {loading ? <p className="email-empty">Loading email activity…</p> : history.length ? <div className="email-history-list">{history.map((item) => <details className="email-history-item" key={item.id}>
        <summary><span className="email-history-main"><strong>{item.subject}</strong><span>{item.sender ? `From ${item.sender.name} · ` : ''}{item.recipients.length} recipient{item.recipients.length === 1 ? '' : 's'} · {formatDate(item.sentAt || item.createdAt)}</span></span><span className={`email-delivery-status ${item.status}`}>{item.status}</span></summary>
        <div className="email-history-detail"><p>{item.message}</p><strong>Recipients</strong><span>{item.recipients.map((person) => `${person.name} (${person.email}) · ${displayRole(person.role)}${person.department ? ` · ${person.department}` : ''}`).join('\n')}</span>{item.error && <p className="form-error">{item.error}</p>}</div>
      </details>)}</div> : <p className="email-empty">No email activity yet.</p>}
    </section>
  </main>
}

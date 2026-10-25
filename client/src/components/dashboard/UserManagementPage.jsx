import { useEffect, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import Footer from '../layout/Footer.jsx'
import PasswordInput from '../shared/PasswordInput.jsx'
import { createAdminUser, downloadAdminDataCsv, getAdminUsers, importAdminUsers, importAdminUsersFromGoogleSheet, updateAdminUser } from '../../services/api.js'
import Pagination from '../common/Pagination.jsx'
import LoadingState from '../common/LoadingState.jsx'
import { validateSpreadsheetFile } from '../../services/validation.js'

/** Formats account creation dates for the administrator's user list. */
function formatDate(value) {
  if (!value) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

/** Allows administrators to verify accounts and assign roles and departments. */
export default function UserManagementPage({ currentUserId }) {
  const [users, setUsers] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [roles, setRoles] = useState([])
  const [departments, setDepartments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [isImportingUsers, setIsImportingUsers] = useState(false)
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [googleSheetUrl, setGoogleSheetUrl] = useState('')
  const [importErrors, setImportErrors] = useState([])
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'employee', departmentId: '', isVerified: true })

  useEffect(() => {
    let isMounted = true
    getAdminUsers({ page })
      .then((result) => {
        if (!isMounted) return
        setUsers(result.users)
        setPagination(result.pagination)
        setRoles(result.roles)
        setDepartments(result.departments || [])
      })
      .catch((requestError) => { if (isMounted) setError(requestError.message) })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [page])

  async function updateUser(user, updates) {
    setUpdatingId(user.id)
    setError('')
    setNotice('')
    try {
      const result = await updateAdminUser(user.id, updates)
      setUsers((current) => current.map((entry) => entry.id === user.id ? result.user : entry))
      setNotice(`${result.user.name}'s account was updated.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId('')
    }
  }

  /** Creates an account and adds the returned user to the table immediately. */
  async function handleCreateUser(event) {
    event.preventDefault()
    setIsCreatingUser(true)
    setError('')
    setNotice('')
    try {
      const result = await createAdminUser(newUser)
      if (page === 1) setUsers((currentUsers) => [result.user, ...currentUsers].slice(0, pagination?.pageSize || 10))
      else setPage(1)
      setPagination((current) => current ? { ...current, totalItems: current.totalItems + 1, totalPages: Math.ceil((current.totalItems + 1) / current.pageSize) } : current)
      setNewUser({ name: '', email: '', password: '', role: 'employee', departmentId: '', isVerified: true })
      setShowCreateUserForm(false)
      setNotice(`Created an account for ${result.user.name}.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsCreatingUser(false)
    }
  }

  /** Adds created accounts to the table and presents row-level issues from a partial import. */
  function showImportResult(result) {
    if (page === 1) setUsers((currentUsers) => [...result.createdUsers, ...currentUsers].slice(0, pagination?.pageSize || 10))
    else setPage(1)
    setPagination((current) => current ? { ...current, totalItems: current.totalItems + result.createdCount, totalPages: Math.ceil((current.totalItems + result.createdCount) / current.pageSize) } : current)
    setImportErrors(result.rowErrors || [])
    const failureCount = result.failedCount || 0
    setNotice(failureCount
      ? `Created ${result.createdCount} user${result.createdCount === 1 ? '' : 's'}; ${failureCount} row${failureCount === 1 ? '' : 's'} need attention below.`
      : `Successfully created ${result.createdCount} user${result.createdCount === 1 ? '' : 's'}.`)
  }

  /** Reads the first sheet from an Excel or CSV file and imports at most 100 user rows. */
  async function handleSpreadsheetUpload(event) {
    const fileInput = event.currentTarget
    const spreadsheetFile = fileInput.files?.[0]
    if (!spreadsheetFile) return

    setIsImportingUsers(true)
    setError('')
    setNotice('')
    setImportErrors([])
    try {
      const fileValidationMessage = await validateSpreadsheetFile(spreadsheetFile)
      if (fileValidationMessage) throw new Error(fileValidationMessage)
      const sheetRows = await readSheet(spreadsheetFile)
      const [headers, ...dataRows] = sheetRows
      if (!headers?.length) throw new Error('The worksheet does not contain a header row.')
      const headerNames = headers.map((header) => String(header ?? '').trim())
      const userRows = dataRows
        .filter((row) => row.some((value) => String(value ?? '').trim()))
        .map((row) => Object.fromEntries(headerNames.map((header, index) => [header, row[index] ?? ''])))
      if (!userRows.length) throw new Error('The first worksheet does not contain any user rows.')
      if (userRows.length > 100) throw new Error('Import up to 100 users at a time. Split this spreadsheet into smaller batches.')
      showImportResult(await importAdminUsers(userRows))
    } catch (importError) {
      setError(importError.message || 'Could not read this spreadsheet.')
    } finally {
      fileInput.value = ''
      setIsImportingUsers(false)
    }
  }

  /** Imports the active tab from a Google Sheet shared for anyone with the link to view. */
  async function handleGoogleSheetImport(event) {
    event.preventDefault()
    setIsImportingUsers(true)
    setError('')
    setNotice('')
    setImportErrors([])
    try {
      showImportResult(await importAdminUsersFromGoogleSheet(googleSheetUrl))
    } catch (importError) {
      setError(importError.message || 'Could not import this Google Sheet.')
    } finally {
      setIsImportingUsers(false)
    }
  }

  /** Downloads every ERP collection as a spreadsheet-friendly CSV file. */
  async function exportAllData() {
    setIsExporting(true)
    setError('')
    setNotice('')
    try {
      await downloadAdminDataCsv()
      setNotice('The complete ERP data export has been downloaded.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="main-panel">
      <main className="dashboard-content user-management-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">ADMINISTRATION</span>
            <h1>User management</h1>
            <p>Review account requests, verify users, and assign ERP roles and departments.</p>
          </div>
          <div className="user-management-actions">
            <span className="user-count">{pagination?.totalItems ?? users.length} {(pagination?.totalItems ?? users.length) === 1 ? 'account' : 'accounts'}</span>
            <button className="button button-primary" type="button" onClick={() => setShowCreateUserForm((isVisible) => !isVisible)}>
              {showCreateUserForm ? 'Cancel' : 'Add user'}
            </button>
            <button className="button button-secondary" type="button" onClick={() => setShowBulkImport((isVisible) => !isVisible)}>
              {showBulkImport ? 'Hide import' : 'Import users'}
            </button>
            <button className="button button-secondary" type="button" onClick={exportAllData} disabled={isExporting}>
              {isExporting ? 'Preparing export...' : 'Export all data (CSV)'}
            </button>
          </div>
        </div>

        {error && <p className="form-message error" role="alert">{error}</p>}
        {notice && <p className="form-message success" role="status">{notice}</p>}
        {importErrors.length > 0 && (
          <section className="panel-card admin-import-errors" aria-label="Spreadsheet import row errors">
            <h2>Rows to review</h2>
            <ul>{importErrors.map((issue, index) => <li key={`${issue.row}-${index}`}><strong>Row {issue.row}:</strong> {issue.message}</li>)}</ul>
          </section>
        )}
        {showBulkImport && (
          <section className="panel-card admin-bulk-import">
            <div className="profile-section-heading">
              <div><h2>Import users in bulk</h2><p>Import up to 100 users per batch. Rows with errors are skipped and reported below.</p></div>
            </div>
            <div className="admin-import-grid">
              <label className="field-label">Excel workbook (.xlsx)
                <input type="file" accept=".xlsx" disabled={isImportingUsers} onChange={handleSpreadsheetUpload} />
              </label>
              <form className="admin-google-sheet-form" onSubmit={handleGoogleSheetImport}>
                <label className="field-label">Google Sheets link
                  <input type="url" value={googleSheetUrl} onChange={(event) => setGoogleSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." disabled={isImportingUsers} required />
                </label>
                <button className="button button-secondary" type="submit" disabled={isImportingUsers || !googleSheetUrl.trim()}>
                  Import sheet
                </button>
              </form>
            </div>
            <p className="admin-import-help">Use columns: <code>name</code>, <code>email</code>, <code>password</code>, and optionally <code>role</code>, <code>department</code>, <code>isVerified</code>. Google Sheets must be shared as “Anyone with the link” with Viewer access. Accounts are verified by default unless the column says no.</p>
            {isImportingUsers && <p className="admin-import-progress" role="status">Reading and importing users...</p>}
          </section>
        )}

        {showCreateUserForm && (
          <form className="panel-card admin-create-user-form" onSubmit={handleCreateUser}>
            <div className="profile-section-heading">
              <div><h2>Add a user</h2><p>Create an account and assign its initial role and department.</p></div>
            </div>
            <div className="admin-create-user-grid">
              <label className="field-label">Full name
                <input value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} minLength="2" maxLength="80" autoComplete="name" required />
              </label>
              <label className="field-label">Email address
                <input type="email" value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} maxLength="254" autoComplete="email" required />
              </label>
              <label className="field-label">Initial password
                <PasswordInput name="password" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} minLength="8" maxLength="72" autoComplete="new-password" required />
              </label>
              <label className="field-label">Role
                <select value={newUser.role} onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value }))} required>
                  {roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
                </select>
              </label>
              <label className="field-label">Department
                <select value={newUser.departmentId} onChange={(event) => setNewUser((current) => ({ ...current, departmentId: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {departments.map((department) => <option key={department._id} value={department._id}>{department.name}</option>)}
                </select>
              </label>
              <label className="admin-create-user-verification">
                <input type="checkbox" checked={newUser.isVerified} onChange={(event) => setNewUser((current) => ({ ...current, isVerified: event.target.checked }))} />
                Verify account immediately
              </label>
            </div>
            <div className="admin-create-user-actions">
              <button className="button button-primary" type="submit" disabled={isCreatingUser || roles.length === 0}>
                {isCreatingUser ? 'Creating account...' : 'Create user'}
              </button>
            </div>
          </form>
        )}

        <section className="panel-card user-table-panel">
          {isLoading ? (
            <LoadingState label="Loading user accounts" />
          ) : users.length === 0 ? (
            <div className="user-table-state">No user accounts found.</div>
          ) : (
            <div className="user-table-scroll">
              <table className="user-table">
                <thead>
                  <tr>
                    <th scope="col">User</th><th scope="col">Account ID</th><th scope="col">Role</th>
                    <th scope="col">Department</th><th scope="col">Verification</th><th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td><div className="managed-user-name">{user.name}</div><div className="managed-user-email">{user.email}</div></td>
                      <td><code className="managed-account-id" title={user.accountId}>{user.accountId}</code></td>
                      <td>
                        <label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.name}</label>
                        <select id={`role-${user.id}`} className="role-select" value={user.role} disabled={Boolean(updatingId) || user.id === currentUserId} onChange={(event) => updateUser(user, { role: event.target.value })}>
                          {roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <label className="sr-only" htmlFor={`department-${user.id}`}>Department for {user.name}</label>
                        <select id={`department-${user.id}`} className="role-select" value={user.department?.id || ''} disabled={Boolean(updatingId)} onChange={(event) => updateUser(user, { departmentId: event.target.value || null })}>
                          <option value="">Unassigned</option>
                          {departments.map((department) => <option key={department._id} value={department._id}>{department.name}</option>)}
                        </select>
                      </td>
                      <td>
                        {user.isVerified ? <span className="verification-badge is-verified">Verified</span> : (
                          <button className="button button-primary verify-button" type="button" disabled={Boolean(updatingId)} onClick={() => updateUser(user, { isVerified: true })}>
                            {updatingId === user.id ? 'Saving...' : 'Verify account'}
                          </button>
                        )}
                      </td>
                      <td>{formatDate(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <Pagination pagination={pagination} onPageChange={setPage} disabled={isLoading} />
      </main>
      <Footer />
    </section>
  )
}



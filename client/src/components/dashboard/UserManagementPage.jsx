import { useEffect, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import { getAdminUsers, updateAdminUser } from '../../services/api.js'

/** Formats account creation dates for the administrator's user list. */
function formatDate(value) {
  if (!value) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

/** Allows administrators to verify accounts and assign roles and departments. */
export default function UserManagementPage({ currentUserId }) {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [departments, setDepartments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let isMounted = true
    getAdminUsers()
      .then((result) => {
        if (!isMounted) return
        setUsers(result.users)
        setRoles(result.roles)
        setDepartments(result.departments || [])
      })
      .catch((requestError) => { if (isMounted) setError(requestError.message) })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

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

  return (
    <section className="main-panel">
      <main className="dashboard-content user-management-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">ADMINISTRATION</span>
            <h1>User management</h1>
            <p>Review account requests, verify users, and assign ERP roles and departments.</p>
          </div>
          <span className="user-count">{users.length} {users.length === 1 ? 'account' : 'accounts'}</span>
        </div>

        {error && <p className="form-message error" role="alert">{error}</p>}
        {notice && <p className="form-message success" role="status">{notice}</p>}

        <section className="panel-card user-table-panel">
          {isLoading ? (
            <div className="user-table-state" role="status">Loading user accounts...</div>
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
      </main>
      <Footer />
    </section>
  )
}


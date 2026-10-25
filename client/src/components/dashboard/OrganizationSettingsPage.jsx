import { useEffect, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import LoadingState from '../common/LoadingState.jsx'
import {
  createAdminDepartment,
  createAdminRole,
  deleteAdminDepartment,
  deleteAdminRole,
  getAdminOrganization,
} from '../../services/api.js'

/** Lets administrators maintain the ERP role and department lists. */
export default function OrganizationSettingsPage() {
  const [roles, setRoles] = useState([])
  const [departments, setDepartments] = useState([])
  const [roleName, setRoleName] = useState('')
  const [departmentName, setDepartmentName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadOrganization() {
    const result = await getAdminOrganization()
    setRoles(result.roles)
    setDepartments(result.departments)
  }

  useEffect(() => {
    let isMounted = true
    getAdminOrganization()
      .then((result) => {
        if (!isMounted) return
        setRoles(result.roles)
        setDepartments(result.departments)
      })
      .catch((requestError) => { if (isMounted) setError(requestError.message) })
      .finally(() => { if (isMounted) setLoading(false) })
    return () => { isMounted = false }
  }, [])

  async function handleCreate(event, type) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (type === 'role') {
        await createAdminRole(roleName)
        setRoleName('')
      } else {
        await createAdminDepartment(departmentName)
        setDepartmentName('')
      }
      await loadOrganization()
      setNotice(type === 'role' ? 'Custom role created.' : 'Department created.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item, type) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (type === 'role') await deleteAdminRole(item._id)
      else await deleteAdminDepartment(item._id)
      await loadOrganization()
      setNotice(`${item.name} was deleted.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="main-panel">
      <main className="dashboard-content organization-settings-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">ADMINISTRATION</span>
            <h1>Roles and departments</h1>
            <p>Create the role and department options used for assigning staff accounts.</p>
          </div>
        </div>
        {error && <p className="form-message error" role="alert">{error}</p>}
        {notice && <p className="form-message success" role="status">{notice}</p>}
        {loading ? <LoadingState label="Loading organization settings" /> : (
          <div className="organization-settings-grid">
            <section className="panel-card organization-setting-card">
              <div className="profile-section-heading">
                <div><h2>User roles</h2><p>Built-in roles are protected. Custom roles can be removed after reassignment.</p></div>
              </div>
              <form className="organization-create-form" onSubmit={(event) => handleCreate(event, 'role')}>
                <label className="field-label">New role<input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="For example, Sales Lead" minLength="2" maxLength="40" required /></label>
                <button className="button button-primary" type="submit" disabled={saving}>Add role</button>
              </form>
              <ul className="organization-item-list">
                {roles.map((role) => (
                  <li key={role._id || role.key}>
                    <span>{role.name}{role.isSystem && <small>Built in</small>}</span>
                    {!role.isSystem && <button className="text-button destructive-text-button" type="button" disabled={saving} onClick={() => handleDelete(role, 'role')}>Delete</button>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel-card organization-setting-card">
              <div className="profile-section-heading">
                <div><h2>Departments</h2><p>Assign employees to the departments that match your organization.</p></div>
              </div>
              <form className="organization-create-form" onSubmit={(event) => handleCreate(event, 'department')}>
                <label className="field-label">New department<input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="For example, Operations" minLength="2" maxLength="60" required /></label>
                <button className="button button-primary" type="submit" disabled={saving}>Add department</button>
              </form>
              <ul className="organization-item-list">
                {departments.length === 0 ? <li className="organization-empty">No departments yet.</li> : departments.map((department) => (
                  <li key={department._id || department.key}>
                    <span>{department.name}</span>
                    <button className="text-button destructive-text-button" type="button" disabled={saving} onClick={() => handleDelete(department, 'department')}>Delete</button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </main>
      <Footer />
    </section>
  )
}

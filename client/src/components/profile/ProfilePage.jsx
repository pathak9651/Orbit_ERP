import { useState } from 'react'
import Footer from '../layout/Footer.jsx'
import { updatePassword, updateProfile } from '../../services/api.js'

function formatDate(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

function SaveMessage({ state }) {
  if (!state) return null
  return <p className={`form-message ${state.type}`} role={state.type === 'error' ? 'alert' : 'status'}>{state.text}</p>
}

export default function ProfilePage({ user, onUserUpdated, notice }) {
  const [profileBusy, setProfileBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState(null)
  const [passwordMessage, setPasswordMessage] = useState(null)

  async function handleProfileSubmit(event) {
    event.preventDefault()
    const form = event.currentTarget
    setProfileBusy(true)
    setProfileMessage(null)
    const fields = new FormData(form)
    const details = Object.fromEntries(fields.entries())
    if (!details.currentPassword) delete details.currentPassword

    try {
      const result = await updateProfile(details)
      onUserUpdated(result.user)
      form.elements.currentPassword.value = ''
      setProfileMessage({ type: 'success', text: 'Your profile details have been saved.' })
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message })
    } finally {
      setProfileBusy(false)
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault()
    setPasswordBusy(true)
    setPasswordMessage(null)
    const form = event.currentTarget
    const fields = new FormData(form)
    const currentPassword = fields.get('currentPassword')
    const newPassword = fields.get('newPassword')
    const confirmPassword = fields.get('confirmPassword')

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'The new passwords do not match.' })
      setPasswordBusy(false)
      return
    }

    try {
      const result = await updatePassword({ currentPassword, newPassword })
      onUserUpdated(result.user)
      form.reset()
      setPasswordMessage({ type: 'success', text: result.message })
    } catch (error) {
      setPasswordMessage({ type: 'error', text: error.message })
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <section className="main-panel">
      <main className="profile-content">
        {notice && <p className="form-message error" role="alert">{notice}</p>}
        <div className="profile-page-heading">
          <div>
            <span className="eyebrow">ACCOUNT</span>
            <h1>Profile settings</h1>
            <p>Manage your personal details, account access, and password.</p>
          </div>
        </div>

        <section className="profile-identity panel-card">
          <span className="profile-avatar-large">{user.name?.[0]?.toUpperCase() || 'U'}</span>
          <div className="identity-copy">
            <h2>{user.name}</h2>
            <p>{user.email}</p>
          </div>
          <span className={`role-badge ${user.role === 'admin' ? 'role-admin' : ''}`}>{user.roleName || user.role || 'user'}</span>
        </section>

        <div className="profile-columns">
          <div className="profile-main-column">
            <section className="panel-card profile-section">
              <div className="profile-section-heading">
                <div><h2>Personal information</h2><p>Update the details associated with your account.</p></div>
              </div>
              <form className="profile-form" onSubmit={handleProfileSubmit}>
                <div className="form-grid">
                  <label className="field-label">Full name<input name="name" defaultValue={user.name} autoComplete="name" minLength="2" maxLength="80" required /></label>
                  <label className="field-label">Email address<input name="email" type="email" defaultValue={user.email} autoComplete="email" required /></label>
                </div>
                <label className="field-label current-password-field">
                  Current password <span className="optional-label">required to change email</span>
                  <input name="currentPassword" type="password" autoComplete="current-password" placeholder="Only needed when changing your email" maxLength="72" />
                </label>
                <SaveMessage state={profileMessage} />
                <div className="form-actions"><button className="button button-primary" type="submit" disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save changes'}</button></div>
              </form>
            </section>

            <section className="panel-card profile-section">
              <div className="profile-section-heading">
                <div><h2>Password and security</h2><p>Use a unique password of at least 8 characters.</p></div>
                <span className="security-icon" aria-hidden="true">⌑</span>
              </div>
              <form className="profile-form" onSubmit={handlePasswordSubmit}>
                <label className="field-label">Current password<input name="currentPassword" type="password" autoComplete="current-password" required maxLength="72" /></label>
                <div className="form-grid">
                  <label className="field-label">New password<input name="newPassword" type="password" autoComplete="new-password" minLength="8" maxLength="72" required /></label>
                  <label className="field-label">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength="8" maxLength="72" required /></label>
                </div>
                <SaveMessage state={passwordMessage} />
                <div className="form-actions"><button className="button button-secondary" type="submit" disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Update password'}</button></div>
              </form>
            </section>
          </div>

          <aside className="profile-side-column">
            <section className="panel-card account-details">
              <div className="profile-section-heading"><div><h2>Account details</h2><p>Information about your Orbit account.</p></div></div>
              <dl className="details-list">
                <div><dt>Account ID</dt><dd>{user.accountId || user.id}</dd></div>
                <div><dt>Access level</dt><dd><span className={`role-badge ${user.role === 'admin' ? 'role-admin' : ''}`}>{user.roleName || user.role || 'user'}</span></dd></div>
                <div><dt>Department / team</dt><dd>{user.department?.name || 'Unassigned'}</dd></div>
                <div><dt>Member since</dt><dd>{formatDate(user.createdAt)}</dd></div>
                <div><dt>Last profile update</dt><dd>{formatDate(user.updatedAt)}</dd></div>
              </dl>
            </section>
            <section className="security-note">
              <span aria-hidden="true">✳</span>
              <div><strong>Keep your account secure</strong><p>Never share your password. Orbit support will never ask you to send it.</p></div>
            </section>
          </aside>
        </div>
      </main>
      <Footer />
    </section>
  )
}






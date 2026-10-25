import { useState } from 'react'
import Footer from '../layout/Footer.jsx'
import PasswordInput from '../shared/PasswordInput.jsx'
import { updatePassword, updateProfile, updateProfileImage } from '../../services/api.js'
import { validateProfileImageFile } from '../../services/validation.js'
import defaultProfileImage from '../../public/images/avtar.jpg'

/** Formats profile timestamps consistently with the browser's locale. */
function formatDate(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

/** Shows the result of a profile save or password change accessibly. */
function SaveMessage({ state }) {
  if (!state) return null
  return <p className={`form-message ${state.type}`} role={state.type === 'error' ? 'alert' : 'status'}>{state.text}</p>
}

/** Lets a signed-in user review account details and manage their credentials. */
export default function ProfilePage({ user, onUserUpdated, notice }) {
  const [profileBusy, setProfileBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState(null)
  const [emailChangeRequested, setEmailChangeRequested] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState(null)
  const [profileImageFile, setProfileImageFile] = useState(null)
  const [profileImagePreview, setProfileImagePreview] = useState('')
  const [profileImageBusy, setProfileImageBusy] = useState(false)
  const [profileImageMessage, setProfileImageMessage] = useState(null)
  const [activeEditor, setActiveEditor] = useState('')
  const profileCompletionFields = [user.name, user.email, user.phone, user.dateOfBirth, user.department?.name, user.profileImage]
  const profileCompletion = Math.round(profileCompletionFields.filter(Boolean).length / profileCompletionFields.length * 100)

  function handleProfileImageSelection(event) {
    const imageFile = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!imageFile) return

    const validationMessage = validateProfileImageFile(imageFile)
    if (validationMessage) {
      setProfileImageFile(null)
      setProfileImagePreview('')
      setProfileImageMessage({ type: 'error', text: validationMessage })
      return
    }

    setProfileImageFile(imageFile)
    setProfileImageMessage(null)
    const imageReader = new FileReader()
    imageReader.onload = () => setProfileImagePreview(typeof imageReader.result === 'string' ? imageReader.result : '')
    imageReader.onerror = () => setProfileImageMessage({ type: 'error', text: 'The selected image could not be previewed.' })
    imageReader.readAsDataURL(imageFile)
  }

  async function handleProfileImageUpload() {
    if (!profileImageFile) return
    setProfileImageBusy(true)
    setProfileImageMessage(null)
    try {
      const result = await updateProfileImage(profileImageFile)
      onUserUpdated(result.user)
      setProfileImageFile(null)
      setProfileImagePreview(result.user.profileImage || '')
      setProfileImageMessage({ type: 'success', text: result.message || 'Profile image updated.' })
    } catch (error) {
      setProfileImageMessage({ type: 'error', text: error.message })
    } finally {
      setProfileImageBusy(false)
    }
  }
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
      if (form.elements.currentPassword) form.elements.currentPassword.value = ''
      setProfileMessage({ type: 'success', text: 'Your profile details have been saved.' })
      setEmailChangeRequested(false)
      setActiveEditor('')
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
      setActiveEditor('')
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

        <section className="profile-card panel-card">
          <section className="profile-identity panel-card">
          <span className="profile-avatar-large">
            {(profileImagePreview || user.profileImage)
              ? <img src={profileImagePreview || user.profileImage} alt={`${user.name}'s profile`} />
              : <img src={defaultProfileImage} alt='Default profile' />}
          </span>
          <div className="identity-copy">
            <h2>{user.name}</h2>
            <p>{user.email}</p>
          </div>
          <span className={`role-badge ${user.role === 'admin' ? 'role-admin' : ''}`}>{user.roleName || user.role || 'user'}</span>
          <span className={`profile-status-badge ${user.isVerified === false ? 'pending' : ''}`}>
            {user.isVerified === false ? 'Pending approval' : 'Approved'}
          </span>
          <div className="profile-completion">
            <div><strong>Profile completion</strong><strong>{profileCompletion}%</strong></div>
            <progress max="100" value={profileCompletion} aria-label={`Profile ${profileCompletion}% complete`} />
          </div>
          <div className="profile-shortcuts">
            <button className="button button-primary" type="button" onClick={() => {
              if (activeEditor === 'profile') {
                setActiveEditor('')
                setEmailChangeRequested(false)
              } else setActiveEditor('profile')
            }}>{activeEditor === 'profile' ? 'Cancel edit' : 'Edit profile'}</button>
            <button className="button button-secondary" type="button" onClick={() => setActiveEditor(activeEditor === 'password' ? '' : 'password')}>Edit password</button>
          </div>
          <div className="profile-image-actions">
            <label className="button button-secondary profile-image-select">
              Profile image
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleProfileImageSelection} aria-label="Choose a profile image" />
            </label>
            {profileImageFile && <button className="button button-primary" type="button" onClick={handleProfileImageUpload} disabled={profileImageBusy}>
              {profileImageBusy ? 'Uploading…' : 'Upload photo'}
            </button>}
              <small>JPEG, PNG, or WebP · max 1.5 MB</small>
            <SaveMessage state={profileImageMessage} />
          </div>
          </section>

          <div className="profile-columns">
          <div className="profile-main-column">
            <section className="panel-card profile-section">
              <div className="profile-section-heading">
                <div><h2>Personal and account details</h2><p>Your current contact, role, and membership information.</p></div>
              </div>
              <dl className="profile-detail-table">
                <div><dt>Username</dt><dd>{user.email}</dd></div>
                <div><dt>Full name</dt><dd>{user.name || 'Not provided'}</dd></div>
                <div><dt>Mobile</dt><dd>{user.phone || 'Not provided'}</dd></div>
                <div><dt>Date of birth</dt><dd>{user.dateOfBirth ? formatDate(user.dateOfBirth) : 'Not provided'}</dd></div>
                <div><dt>Account ID</dt><dd>{user.accountId || user.id}</dd></div>
                <div><dt>Role</dt><dd>{user.roleName || user.role || 'Employee'}</dd></div>
                <div><dt>Department</dt><dd>{user.department?.name || 'Unassigned'}</dd></div>
                <div><dt>Account status</dt><dd>{user.isVerified === false ? 'Pending approval' : 'Approved'}</dd></div>
                <div><dt>Member since</dt><dd>{formatDate(user.createdAt)}</dd></div>
                <div><dt>Last profile update</dt><dd>{formatDate(user.updatedAt)}</dd></div>
              </dl>
              <form className="profile-form" onSubmit={handleProfileSubmit} hidden={activeEditor !== 'profile'}>
                <div className="form-grid">
                  <label className="field-label">Full name<input name="name" defaultValue={user.name} autoComplete="name" minLength="2" maxLength="80" required /></label>
                  <label className="field-label">Email address<input name="email" type="email" defaultValue={user.email} autoComplete="email" onChange={(event) => setEmailChangeRequested(event.currentTarget.value.trim().toLowerCase() !== user.email.toLowerCase())} required /></label>
                  <label className="field-label">Mobile number<input name="phone" type="tel" defaultValue={user.phone || ''} autoComplete="tel" inputMode="tel" maxLength="25" /></label>
                  <label className="field-label">Date of birth<input name="dateOfBirth" type="date" defaultValue={user.dateOfBirth || ''} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} /></label>
                </div>
                {emailChangeRequested && <label className="field-label current-password-field">
                  Current password <span className="optional-label">required to change email</span>
                  <PasswordInput name="currentPassword" autoComplete="current-password" placeholder="Enter your current password" maxLength="72" required />
                </label>}
                <SaveMessage state={profileMessage} />
                <div className="form-actions"><button className="button button-primary" type="submit" disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save changes'}</button></div>
              </form>
            </section>

            <section className="panel-card profile-section" hidden={activeEditor !== 'password'}>
              <div className="profile-section-heading">
                <div><h2>Password and security</h2><p>Use a unique password of at least 8 characters.</p></div>
                <span className="security-icon" aria-hidden="true">⌑</span>
              </div>
              <form className="profile-form" onSubmit={handlePasswordSubmit}>
                <label className="field-label">Current password<PasswordInput name="currentPassword" autoComplete="current-password" required maxLength="72" /></label>
                <div className="form-grid">
                  <label className="field-label">New password<PasswordInput name="newPassword" autoComplete="new-password" minLength="8" maxLength="72" required /></label>
                  <label className="field-label">Confirm new password<PasswordInput name="confirmPassword" autoComplete="new-password" minLength="8" maxLength="72" required /></label>
                </div>
                <SaveMessage state={passwordMessage} />
                <div className="form-actions"><button className="button button-secondary" type="submit" disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Update password'}</button></div>
              </form>
            </section>
          </div>

          <aside className="profile-side-column">
            <section className="panel-card account-details" hidden>
              <div className="profile-section-heading"><div><h2>Account details</h2><p>Information about your Orbit account.</p></div></div>
              <dl className="details-list profile-details-grid">
                <div><dt>Account ID</dt><dd>{user.accountId || user.id}</dd></div>
                <div><dt>Access level</dt><dd><span className={`role-badge ${user.role === 'admin' ? 'role-admin' : ''}`}>{user.roleName || user.role || 'user'}</span></dd></div>
                <div><dt>Department / team</dt><dd>{user.department?.name || 'Unassigned'}</dd></div>
                <div><dt>Member since</dt><dd>{formatDate(user.createdAt)}</dd></div>
                <div><dt>Last profile update</dt><dd>{formatDate(user.updatedAt)}</dd></div>
              </dl>
            </section>
            <section className="security-note profile-security-note" hidden>
              <span aria-hidden="true">✳</span>
              <div><strong>Keep your account secure</strong><p>Never share your password. Orbit support will never ask you to send it.</p></div>
            </section>
          </aside>
          </div>
        </section>
      </main>
      <Footer />
    </section>
  )
}









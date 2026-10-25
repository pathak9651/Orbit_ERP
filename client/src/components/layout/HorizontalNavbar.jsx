import NotificationBell from './NotificationBell.jsx'
import orbitLogo from '../../assets/orbit-logo.svg'
import defaultProfileImage from '../../public/images/avtar.jpg'

/** Renders the persistent top bar with identity, notifications, and sign-out. */
export default function HorizontalNavbar({ user, onSignOut, signingOut, notifications, unreadCount, pagination, onNotificationPageChange, onOpenNotification, onMarkAllNotificationsRead }) {
  return (
    <header className="horizontal-navbar">
      <a className="brand" href="#overview" aria-label="Orbit ERP home">
        <img className="brand-mark" src={orbitLogo} alt="" aria-hidden="true" />
        <span>orbit<span className="brand-muted">ERP</span></span>
      </a>
      <div className="horizontal-navbar-account">
        <NotificationBell notifications={notifications} unreadCount={unreadCount} pagination={pagination} onPageChange={onNotificationPageChange} onOpen={onOpenNotification} onMarkAll={onMarkAllNotificationsRead} />
        <span className="horizontal-user-name">{user.name}</span>
        <img className="avatar avatar-small" src={user.profileImage || defaultProfileImage} alt="" />
        <button className="horizontal-signout" type="button" onClick={onSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </header>
  )
}


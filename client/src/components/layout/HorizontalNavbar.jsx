import NotificationBell from './NotificationBell.jsx'

/** Renders the persistent top bar with identity, notifications, and sign-out. */
export default function HorizontalNavbar({ user, onSignOut, signingOut, notifications, unreadCount, pagination, onNotificationPageChange, onOpenNotification, onMarkAllNotificationsRead }) {
  return (
    <header className="horizontal-navbar">
      <a className="brand" href="#overview" aria-label="Orbit ERP home">
        <span className="brand-mark" aria-hidden="true">o</span>
        <span>orbit<span className="brand-muted">ERP</span></span>
      </a>
      <div className="horizontal-navbar-account">
        <NotificationBell notifications={notifications} unreadCount={unreadCount} pagination={pagination} onPageChange={onNotificationPageChange} onOpen={onOpenNotification} onMarkAll={onMarkAllNotificationsRead} />
        <span className="horizontal-user-name">{user.name}</span>
        <span className="avatar avatar-small" aria-hidden="true">{user.name?.[0]?.toUpperCase() || 'U'}</span>
        <button className="horizontal-signout" type="button" onClick={onSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </header>
  )
}

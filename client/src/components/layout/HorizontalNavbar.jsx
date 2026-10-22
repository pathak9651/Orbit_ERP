export default function HorizontalNavbar({ user, onSignOut, signingOut }) {
  return (
    <header className="horizontal-navbar">
      <a className="brand" href="#overview" aria-label="Orbit ERP home">
        <span className="brand-mark" aria-hidden="true">o</span>
        <span>orbit<span className="brand-muted">ERP</span></span>
      </a>
      <div className="horizontal-navbar-account">
        <span className="horizontal-user-name">{user.name}</span>
        <span className="avatar avatar-small" aria-hidden="true">{user.name?.[0]?.toUpperCase() || 'U'}</span>
        <button className="horizontal-signout" type="button" onClick={onSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </header>
  )
}

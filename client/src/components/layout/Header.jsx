export default function Header({ user, currentPage = 'Overview' }) {
  return (
    <header className="topbar">
      <div className="breadcrumbs"><span>Workspace</span><span aria-hidden="true">/</span><strong>{currentPage}</strong></div>
      <div className="topbar-actions">
        <button className="icon-button" type="button" aria-label="Notifications" title="No new notifications">♧</button>
      </div>
    </header>
  )
}


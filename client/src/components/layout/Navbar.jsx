const userNavigation = [
  { icon: 'HM', label: 'Home', page: 'overview' },
  { icon: 'TK', label: 'My tasks', page: 'tasks' },
  { icon: 'AT', label: 'Attendance', page: 'attendance' },
  { icon: 'LV', label: 'Leave requests', page: 'leaves' },
  { icon: 'ME', label: 'Profile', page: 'profile' },
]

const adminNavigation = [
  { icon: 'HM', label: 'Home', page: 'overview' },
  { icon: 'US', label: 'User management', page: 'users' },
  { icon: 'TK', label: 'Task management', page: 'tasks' },
  { icon: 'AT', label: 'Attendance', page: 'attendance' },
  { icon: 'LV', label: 'Leave requests', page: 'leaves' },
  { icon: 'HK', label: 'Housekeeping', page: 'housekeeping' },
  { icon: 'BI', label: 'Bills and invoices', page: 'billing' },
  { icon: 'RV', label: 'Revenue', page: 'revenue' },
  { icon: 'RP', label: 'Reports', page: 'reports' },
  { icon: 'RD', label: 'Roles and departments', page: 'organization' },
  { icon: 'ME', label: 'Profile', page: 'profile' },
]

export default function Navbar({ user, currentPage, onNavigate }) {
  const navigation = user.role === 'admin' ? adminNavigation : userNavigation

  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="workspace-picker" aria-label="Current workspace">
        <span className="workspace-symbol" aria-hidden="true">O</span>
        <span className="workspace-copy">Orbit workspace<small>{user.role === 'admin' ? 'Administrator' : 'Personal workspace'}</small></span>
        <span className="workspace-chevron" aria-hidden="true">v</span>
      </div>

      <div className="navigation-label">{user.role === 'admin' ? 'ADMINISTRATION' : 'WORKSPACE'}</div>
      <nav className="primary-navigation" aria-label="Main navigation">
        {navigation.map((item) => (
          <button
            className={`navigation-item ${item.page === currentPage ? 'is-active' : ''}`}
            key={item.page}
            type="button"
            onClick={() => onNavigate(item.page)}
            aria-current={item.page === currentPage ? 'page' : undefined}
          >
            <span className="navigation-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="help-card">
          <span className="help-symbol" aria-hidden="true">?</span>
          <strong>Need a hand?</strong>
          <p>Questions about your workspace? Get in touch with our support team.</p>
          <a href="mailto:support@orbit.example">Contact support <span aria-hidden="true">&gt;</span></a>
        </div>
      </div>
    </aside>
  )
}




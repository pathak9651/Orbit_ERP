import { useEffect, useState } from 'react'
import { canAccessBilling } from '../../services/permissions.js'
import orbitLogo from '../../assets/orbit-logo.svg'

// Employee navigation contains only pages available to every signed-in role.
const userNavigation = [
  { icon: 'HM', label: 'Home', page: 'overview' },
  { icon: 'AB', label: 'About', page: 'about' },
  { icon: 'TK', label: 'My tasks', page: 'tasks' },
  { icon: 'AT', label: 'Attendance', page: 'attendance' },
  { icon: 'LV', label: 'Leave requests', page: 'leaves' },
  { icon: 'EM', label: 'Email', page: 'email' },
  { icon: 'DC', label: 'Documents', page: 'documents' },
  { icon: 'CA', label: 'Office calendar', page: 'calendar' },
  { icon: 'CH', label: 'Team chat', page: 'chat' },
  { icon: 'ME', label: 'Profile', page: 'profile' },
]

// Administrators receive organization-management pages in addition to shared tools.
const adminNavigation = [
  { icon: 'HM', label: 'Home', page: 'overview' },
  { icon: 'AB', label: 'About', page: 'about' },
  { icon: 'US', label: 'User management', page: 'users' },
  { icon: 'CRM', label: 'CRM customers', page: 'customers' },
  { icon: 'TK', label: 'Task management', page: 'tasks' },
  { icon: 'AT', label: 'Attendance', page: 'attendance' },
  { icon: 'LV', label: 'Leave requests', page: 'leaves' },
  { icon: 'EM', label: 'Email', page: 'email' },
  { icon: 'DC', label: 'Documents', page: 'documents' },
  { icon: 'CA', label: 'Office calendar', page: 'calendar' },
  { icon: 'CH', label: 'Team chat', page: 'chat' },
  { icon: 'IV', label: 'Inventory management', page: 'inventory' },
  { icon: 'BI', label: 'Bills and invoices', page: 'billing' },
  { icon: 'RV', label: 'Revenue', page: 'revenue' },
  { icon: 'RP', label: 'Reports', page: 'reports' },
  { icon: 'AU', label: 'Security audit', page: 'audit' },
  { icon: 'RD', label: 'Roles and departments', page: 'organization' },
  { icon: 'ME', label: 'Profile', page: 'profile' },
]

/** Renders the responsive workspace navigation for the current user's role. */
export default function Navbar({ user, currentPage, onNavigate }) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true)
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia('(max-width: 720px)').matches)
  useEffect(() => {
    const mobileViewport = window.matchMedia('(max-width: 720px)')
    function updateViewport(event) {
      setIsMobileViewport(event.matches)
      setIsSidebarExpanded(true)
    }
    mobileViewport.addEventListener('change', updateViewport)
    return () => mobileViewport.removeEventListener('change', updateViewport)
  }, [])
  const navigation = user.role === 'admin'
    ? adminNavigation
    : [...userNavigation, ...(canAccessBilling(user) ? [{ icon: 'BI', label: 'Bills and invoices', page: 'billing' }] : [])]

  return <>
    <aside className={`sidebar ${isSidebarExpanded ? 'sidebar-expanded mobile-nav-expanded' : 'sidebar-collapsed mobile-nav-collapsed'}`} aria-label="Workspace navigation">
      <button
        className="mobile-sidebar-toggle mobile-sidebar-close-toggle sidebar-toggle"
        type="button"
        aria-label={isMobileViewport ? (isSidebarExpanded ? 'Close navigation' : 'Open navigation') : (isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar')}
        title={isMobileViewport ? (isSidebarExpanded ? 'Close navigation' : 'Open navigation') : (isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar')}
        aria-expanded={isSidebarExpanded}
        aria-controls="workspace-navigation"
        onClick={() => setIsSidebarExpanded((expanded) => !expanded)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {isSidebarExpanded ? <path d="m15 5-7 7 7 7" /> : <path d="m9 5 7 7-7 7" />}
        </svg>
      </button>
      <div className="workspace-picker" aria-label="Current workspace">
        <span className="workspace-symbol" aria-hidden="true"><img src={orbitLogo} alt="" /></span>
        <span className="workspace-copy">Orbit workspace<small>{user.role === 'admin' ? 'Administrator' : 'Personal workspace'}</small></span>
        <span className="workspace-chevron" aria-hidden="true">v</span>
      </div>

      <div className="navigation-label">{user.role === 'admin' ? 'ADMINISTRATION' : 'WORKSPACE'}</div>
      <nav className="primary-navigation" id="workspace-navigation" aria-label="Main navigation" aria-hidden={isMobileViewport && !isSidebarExpanded} inert={isMobileViewport && !isSidebarExpanded}>
        {navigation.map((item) => (
          <button
            className={`navigation-item ${item.page === currentPage ? 'is-active' : ''}`}
            key={item.page}
            type="button"
            title={!isSidebarExpanded || isMobileViewport ? item.label : undefined}
            onClick={() => {
              onNavigate(item.page)
              if (isMobileViewport) setIsSidebarExpanded(false)
            }}
            aria-current={item.page === currentPage ? 'page' : undefined}
          >
            <span className="navigation-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

    </aside>
    {isMobileViewport && isSidebarExpanded && <button
      className="mobile-sidebar-toggle mobile-sidebar-close-float"
      type="button"
      aria-label="Close navigation"
      aria-expanded="true"
      aria-controls="workspace-navigation"
      onClick={() => setIsSidebarExpanded(false)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 5-7 7 7 7" /></svg>
    </button>}
    {isMobileViewport && !isSidebarExpanded && <button
      className="mobile-sidebar-toggle mobile-sidebar-open-toggle"
      type="button"
      aria-label="Open navigation"
      aria-expanded="false"
      aria-controls="workspace-navigation"
      onClick={() => setIsSidebarExpanded(true)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h13" /><path d="m12 6 6 6-6 6" /></svg>
    </button>}
  </>
}

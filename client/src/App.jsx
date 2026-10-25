/** Coordinates session state, role-based navigation, page rendering, and notification refreshes. */
import { useEffect, useState } from 'react'
import AuthScreen from './components/auth/AuthScreen.jsx'
import HomePage from './components/dashboard/HomePage.jsx'
import AdminOverviewPage from './components/dashboard/AdminOverviewPage.jsx'
import AdminModulePage from './components/dashboard/AdminModulePage.jsx'
import UserManagementPage from './components/dashboard/UserManagementPage.jsx'
import OrganizationSettingsPage from './components/dashboard/OrganizationSettingsPage.jsx'
import TaskPage from './components/dashboard/TaskPage.jsx'
import AttendancePage from './components/dashboard/AttendancePage.jsx'
import LeavePage from './components/dashboard/LeavePage.jsx'
import EmailPage from './components/dashboard/EmailPage.jsx'
import BillingPage from './components/dashboard/BillingPage.jsx'
import AuditEventsPage from './components/dashboard/AuditEventsPage.jsx'
import ProfilePage from './components/profile/ProfilePage.jsx'
import Navbar from './components/layout/Navbar.jsx'
import HorizontalNavbar from './components/layout/HorizontalNavbar.jsx'
import { canAccessBilling } from './services/permissions.js'
import { getCurrentUser, getNotifications, markAllNotificationsRead, markNotificationRead, requestPasswordReset, resetPassword, signIn, signOut, signUp } from './services/api.js'

const WORKSPACE_PAGES = new Set(['overview', 'users', 'tasks', 'attendance', 'leaves', 'email', 'housekeeping', 'billing', 'revenue', 'reports', 'audit', 'organization', 'profile'])

/** Restores a known workspace page from the browser URL, defaulting safely to Home. */
function readWorkspacePageFromUrl() {
  const requestedPage = window.location.hash.slice(1)
  return WORKSPACE_PAGES.has(requestedPage) ? requestedPage : 'overview'
}

/** Prevents a manually entered URL from exposing a page outside the user's navigation. */
function canOpenWorkspacePage(user, page) {
  if (user.role === 'admin') return true
  return ['overview', 'profile', 'tasks', 'attendance', 'leaves', 'email'].includes(page)
    || (page === 'billing' && canAccessBilling(user))
}

export default function App() {
  const [authMode, setAuthMode] = useState('login')
  const [user, setUser] = useState(null)
  const [currentPage, setCurrentPage] = useState(readWorkspacePageFromUrl)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationPagination, setNotificationPagination] = useState(null)
  const [notificationPage, setNotificationPage] = useState(1)

  useEffect(() => {
    const resetToken = new URLSearchParams(window.location.search).get('resetToken')
    if (resetToken) {
      setResetToken(resetToken)
      setAuthMode('reset')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Keep route changes in the URL so refresh and browser back/forward restore the page.
  useEffect(() => {
    function restorePageFromUrl() {
      setCurrentPage(readWorkspacePageFromUrl())
      setAuthError('')
    }
    window.addEventListener('popstate', restorePageFromUrl)
    window.addEventListener('hashchange', restorePageFromUrl)
    return () => {
      window.removeEventListener('popstate', restorePageFromUrl)
      window.removeEventListener('hashchange', restorePageFromUrl)
    }
  }, [])

  useEffect(() => {
    const pageHash = `#${currentPage}`
    if (window.location.hash === pageHash) return
    window.history.pushState({ page: currentPage }, '', `${window.location.pathname}${window.location.search}${pageHash}`)
  }, [currentPage])

  // Restore the cookie-backed session at startup so a page refresh does not sign the user out.
  useEffect(() => {
    let isMounted = true
    getCurrentUser()
      .then(({ user: currentUser }) => {
        if (!isMounted) return
        setUser(currentUser)
        setCurrentPage((page) => canOpenWorkspacePage(currentUser, page) ? page : 'overview')
      })
      .catch(() => {})
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  const isAuthenticated = Boolean(user)

  // Recheck the session periodically so disabled or expired accounts lose access promptly.
  useEffect(() => {
    if (!isAuthenticated || isSigningOut) return undefined
    let isActive = true

    async function refreshUser() {
      try {
        const { user: refreshedUser } = await getCurrentUser()
        if (!isActive) return
        setUser(refreshedUser)
        setCurrentPage((page) => canOpenWorkspacePage(refreshedUser, page) ? page : 'overview')
      } catch (error) {
        if (!isActive || (error.status !== 401 && error.status !== 403)) return
        setUser(null)
        setNotifications([])
        setUnreadCount(0)
        setCurrentPage('overview')
        setAuthMode('login')
        setAuthError(error.message)
      }
    }

    const timer = window.setInterval(refreshUser, 5000)
    return () => {
      isActive = false
      window.clearInterval(timer)
    }
  }, [isAuthenticated, isSigningOut])

  // Poll for notifications while signed in; the server remains the source of truth.
  useEffect(() => {
    if (!isAuthenticated || isSigningOut) return undefined
    let isActive = true
    async function refreshNotifications() {
      try {
        const result = await getNotifications({ page: notificationPage })
        if (!isActive) return
        setNotifications(result.notifications)
        setUnreadCount(result.unreadCount)
        setNotificationPagination(result.pagination)
      } catch { /* The notification feed retries on the next refresh. */ }
    }
    refreshNotifications()
    const timer = window.setInterval(refreshNotifications, 5000)
    return () => { isActive = false; window.clearInterval(timer) }
  }, [isAuthenticated, isSigningOut, notificationPage])
  async function handleAuthSubmit(event) {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    setIsSubmitting(true)
    const form = new FormData(event.currentTarget)
    const details = Object.fromEntries(form.entries())

    try {
      if (authMode === 'login') {
        const result = await signIn(details)
        setNotifications([])
        setUnreadCount(0)
        setCurrentPage('overview')
        setUser(result.user)
      } else if (authMode === 'signup') {
        if (details.password !== details.confirmPassword) throw new Error('The passwords do not match.')
        const { confirmPassword, ...signupDetails } = details
        const result = await signUp(signupDetails)
        setAuthMode('login')
        setAuthNotice(result.message || 'Your account request was sent for approval.')
      } else if (authMode === 'forgot') {
        const result = await requestPasswordReset(details.email)
        setAuthMode('login')
        setAuthNotice(result.message)
      } else if (authMode === 'reset') {
        if (details.newPassword !== details.confirmPassword) throw new Error('The new passwords do not match.')
        const result = await resetPassword({ token: details.token || resetToken, newPassword: details.newPassword })
        setResetToken('')
        setAuthMode('login')
        setAuthNotice(result.message)
      }
    } catch (error) {
      setAuthError(error.message || 'Could not connect to the server.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOut()
      setUser(null)
      setNotifications([])
      setUnreadCount(0)
      setCurrentPage('overview')
      setAuthMode('login')
    } catch (error) {
      setAuthError(error.message || 'Could not sign out. Please try again.')
    } finally {
      setIsSigningOut(false)
    }
  }

  async function handleNotificationOpen(notification) {
    if (!notification.readAt) {
      const readAt = new Date().toISOString()
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt } : item))
      setUnreadCount((count) => Math.max(0, count - 1))
      markNotificationRead(notification.id).catch(() => {})
    }
    setCurrentPage(notification.page || 'overview')
    setAuthError('')
  }

  async function handleMarkAllNotificationsRead() {
    if (!unreadCount) return
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt }))
    setUnreadCount(0)
    try { await markAllNotificationsRead() } catch { /* The next refresh restores the server state if needed. */ }
  }

  if (isLoading) {
    return <main className="loading-screen" aria-label="Loading Orbit"><span className="loading-mark">o</span></main>
  }

  if (!user) {
    return (
      <AuthScreen
        mode={authMode}
        onModeChange={(nextMode) => { setAuthMode(nextMode); setAuthError(''); setAuthNotice('') }}
        onSubmit={handleAuthSubmit}
        error={authError}
        notice={authNotice}
        busy={isSubmitting}
        resetToken={resetToken}
      />
    )
  }

  return (
    <div className="workspace-layout">
      <HorizontalNavbar user={user} onSignOut={handleSignOut} signingOut={isSigningOut} notifications={notifications} unreadCount={unreadCount} pagination={notificationPagination} onNotificationPageChange={setNotificationPage} onOpenNotification={handleNotificationOpen} onMarkAllNotificationsRead={handleMarkAllNotificationsRead} />
      <div className="workspace-shell">
        <Navbar
          user={user}
          currentPage={currentPage}
          onNavigate={(page) => { setCurrentPage(page); setAuthError('') }}
        />
        {currentPage === 'tasks'
          ? <TaskPage user={user} />
          : currentPage === 'attendance'
            ? <AttendancePage user={user} />
          : currentPage === 'leaves'
            ? <LeavePage user={user} />
          : currentPage === 'email'
            ? <EmailPage user={user} />
          : currentPage === 'billing' && canAccessBilling(user)
            ? <BillingPage user={user} />
          : currentPage === 'profile'
          ? <ProfilePage user={user} onUserUpdated={setUser} notice={authError} />
          : user.role === 'admin' && currentPage === 'audit'
            ? <AuditEventsPage />
          : user.role === 'admin' && currentPage === 'overview'
            ? <AdminOverviewPage />
          : user.role === 'admin' && currentPage === 'users'
            ? <UserManagementPage currentUserId={user.id} />
          : user.role === 'admin' && currentPage === 'organization'
            ? <OrganizationSettingsPage />
            : user.role === 'admin' && currentPage !== 'overview'
              ? <AdminModulePage section={currentPage} />
              : <HomePage user={user} message={authError} />}
      </div>
    </div>
  )
}



















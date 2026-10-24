/** Coordinates session state, role-based navigation, page rendering, and notification refreshes. */
import { useEffect, useState } from 'react'
import AuthScreen from './components/auth/AuthScreen.jsx'
import HomePage from './components/dashboard/HomePage.jsx'
import AdminModulePage from './components/dashboard/AdminModulePage.jsx'
import UserManagementPage from './components/dashboard/UserManagementPage.jsx'
import OrganizationSettingsPage from './components/dashboard/OrganizationSettingsPage.jsx'
import TaskPage from './components/dashboard/TaskPage.jsx'
import AttendancePage from './components/dashboard/AttendancePage.jsx'
import LeavePage from './components/dashboard/LeavePage.jsx'
import EmailPage from './components/dashboard/EmailPage.jsx'
import BillingPage from './components/dashboard/BillingPage.jsx'
import ProfilePage from './components/profile/ProfilePage.jsx'
import Navbar from './components/layout/Navbar.jsx'
import HorizontalNavbar from './components/layout/HorizontalNavbar.jsx'
import { canAccessBilling } from './services/permissions.js'
import { getCurrentUser, getNotifications, markAllNotificationsRead, markNotificationRead, signIn, signOut, signUp } from './services/api.js'

export default function App() {
  const [authMode, setAuthMode] = useState('login')
  const [user, setUser] = useState(null)
  const [currentPage, setCurrentPage] = useState('overview')
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  // Restore the cookie-backed session at startup so a page refresh does not sign the user out.
  useEffect(() => {
    let isMounted = true
    getCurrentUser()
      .then(({ user: currentUser }) => { if (isMounted) setUser(currentUser) })
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
        setCurrentPage((page) => refreshedUser.role !== 'admin' && !['overview', 'profile', 'tasks', 'attendance', 'leaves', 'email'].includes(page) && !(page === 'billing' && canAccessBilling(refreshedUser)) ? 'overview' : page)
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
        const result = await getNotifications()
        if (!isActive) return
        setNotifications(result.notifications)
        setUnreadCount(result.unreadCount)
      } catch { /* The notification feed retries on the next refresh. */ }
    }
    refreshNotifications()
    const timer = window.setInterval(refreshNotifications, 5000)
    return () => { isActive = false; window.clearInterval(timer) }
  }, [isAuthenticated, isSigningOut])
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
      } else {
        const result = await signUp(details)
        setAuthMode('login')
        setAuthNotice(result.message || 'Your account request was sent for approval.')
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
      />
    )
  }

  return (
    <div className="workspace-layout">
      <HorizontalNavbar user={user} onSignOut={handleSignOut} signingOut={isSigningOut} notifications={notifications} unreadCount={unreadCount} onOpenNotification={handleNotificationOpen} onMarkAllNotificationsRead={handleMarkAllNotificationsRead} />
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



















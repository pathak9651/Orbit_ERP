/** Coordinates session state, role-based navigation, page rendering, and notification refreshes. */
import { useEffect, useRef, useState } from 'react'
import AuthScreen from './components/auth/AuthScreen.jsx'
import HomePage from './components/dashboard/DailyHomePage.jsx'
import AboutPage from './components/dashboard/AboutPage.jsx'
import AdminOverviewPage from './components/dashboard/AdminOverviewPage.jsx'
import AdminReportsPage from './components/dashboard/AdminReportsPage.jsx'
import RevenuePage from './components/dashboard/RevenuePage.jsx'
import AdminModulePage from './components/dashboard/AdminModulePage.jsx'
import UserManagementPage from './components/dashboard/UserManagementPage.jsx'
import CustomerManagementPage from './components/dashboard/CustomerManagementPage.jsx'
import InventoryManagementPage from './components/dashboard/InventoryManagementPage.jsx'
import OrganizationSettingsPage from './components/dashboard/OrganizationSettingsPage.jsx'
import TaskPage from './components/dashboard/TaskPage.jsx'
import AttendancePage from './components/dashboard/AttendancePage.jsx'
import LeavePage from './components/dashboard/LeavePage.jsx'
import EmailPage from './components/dashboard/EmailPage.jsx'
import BillingPage from './components/dashboard/BillingPage.jsx'
import AuditEventsPage from './components/dashboard/AuditEventsPage.jsx'
import ChatPage from './components/dashboard/ChatPage.jsx'
import DocumentsPage from './components/dashboard/DocumentsPage.jsx'
import CalendarPage from './components/dashboard/CalendarPage.jsx'
import LoadingState from './components/common/LoadingState.jsx'
import ProfilePage from './components/profile/ProfilePage.jsx'
import Navbar from './components/layout/Navbar.jsx'
import HorizontalNavbar from './components/layout/HorizontalNavbar.jsx'
import { canAccessBilling } from './services/permissions.js'
import { shouldShowOffPageChatNotification } from './services/chat.js'
import { getCurrentUser, getNotifications, markAllNotificationsRead, markNotificationRead, requestPasswordReset, resetPassword, signIn, signOut, signUp, stopUserImpersonation } from './services/api.js'

const WORKSPACE_PAGES = new Set(['overview', 'about', 'users', 'customers', 'tasks', 'attendance', 'leaves', 'email', 'documents', 'calendar', 'chat', 'inventory', 'billing', 'revenue', 'reports', 'audit', 'organization', 'profile'])

/** Restores a known workspace page from the browser URL, defaulting safely to Home. */
function readWorkspacePageFromUrl() {
  const requestedPage = window.location.hash.slice(1)
  return WORKSPACE_PAGES.has(requestedPage) ? requestedPage : 'overview'
}

/** Prevents a manually entered URL from exposing a page outside the user's navigation. */
function canOpenWorkspacePage(user, page) {
  if (user.role === 'admin') return true
  return ['overview', 'about', 'profile', 'tasks', 'attendance', 'leaves', 'email', 'documents', 'calendar', 'chat'].includes(page)
    || (page === 'billing' && canAccessBilling(user))
}

export default function App() {
  const [authMode, setAuthMode] = useState('login')
  const [user, setUser] = useState(null)
  const [impersonation, setImpersonation] = useState(null)
  const [currentPage, setCurrentPage] = useState(readWorkspacePageFromUrl)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [loginCooldownUntil, setLoginCooldownUntil] = useState(0)
  const [resetToken, setResetToken] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationPagination, setNotificationPagination] = useState(null)
  const [notificationPage, setNotificationPage] = useState(1)
  const [hasNewChatMessage, setHasNewChatMessage] = useState(false)
  const currentPageRef = useRef(currentPage)
  currentPageRef.current = currentPage

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
      .then(({ user: currentUser, impersonation: activeImpersonation }) => {
        if (!isMounted) return
        setUser(currentUser)
        setImpersonation(activeImpersonation || null)
        setCurrentPage((page) => canOpenWorkspacePage(currentUser, page) ? page : 'overview')
      })
      .catch(() => {})
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  const isAuthenticated = Boolean(user)

  // Keep the chat socket alive across workspace pages so off-page messages can alert the user.
  useEffect(() => {
    if (!isAuthenticated || isSigningOut || !user?.id) return undefined
    let reconnectTimer
    let disposed = false
    let chatSocket

    function connectToChat() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/chat/ws`)
      chatSocket = socket
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type !== 'chat:message') return
          const isOffPageIncomingMessage = shouldShowOffPageChatNotification(currentPageRef.current, payload.message.sender?._id, user.id)
          if (!isOffPageIncomingMessage && String(payload.message.sender?._id) === String(user.id)) return
          if (isOffPageIncomingMessage) setHasNewChatMessage(true)
          if (String(payload.message.sender?._id) === String(user.id)) return
          socket.send(JSON.stringify({ type: 'chat:delivered', conversationId: payload.conversationId, messageId: payload.message._id }))
        } catch { /* Ignore malformed events and keep the chat connection available. */ }
      }
      socket.onclose = () => {
        if (!disposed) reconnectTimer = window.setTimeout(connectToChat, 2500)
      }
    }

    connectToChat()
    return () => {
      disposed = true
      window.clearTimeout(reconnectTimer)
      chatSocket?.close()
    }
  }, [isAuthenticated, isSigningOut, user?.id])

  useEffect(() => {
    if (currentPage === 'chat') setHasNewChatMessage(false)
  }, [currentPage])

  // Recheck the session periodically so disabled or expired accounts lose access promptly.
  useEffect(() => {
    if (!isAuthenticated || isSigningOut) return undefined
    let isActive = true

    async function refreshUser() {
      try {
        const { user: refreshedUser, impersonation: activeImpersonation } = await getCurrentUser()
        if (!isActive) return
        setUser(refreshedUser)
        setImpersonation(activeImpersonation || null)
        setCurrentPage((page) => canOpenWorkspacePage(refreshedUser, page) ? page : 'overview')
      } catch (error) {
        if (!isActive || (error.status !== 401 && error.status !== 403)) return
        setUser(null)
        setNotifications([])
        setUnreadCount(0)
        setHasNewChatMessage(false)
        setImpersonation(null)
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
        setLoginCooldownUntil(0)
        setNotifications([])
        setUnreadCount(0)
        setHasNewChatMessage(false)
        setImpersonation(null)
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
      if (authMode === 'login' && error.status === 429 && error.retryAfterSeconds) {
        setLoginCooldownUntil(Date.now() + error.retryAfterSeconds * 1000)
      } else if (authMode === 'login') {
        setLoginCooldownUntil(0)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOut()
      setUser(null)
      setImpersonation(null)
      setNotifications([])
      setUnreadCount(0)
      setHasNewChatMessage(false)
        setImpersonation(null)
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

  function handleImpersonationStart(result) {
    setNotifications([])
    setUnreadCount(0)
    setNotificationPagination(null)
    setNotificationPage(1)
    setHasNewChatMessage(false)
    setUser(result.user)
    setImpersonation(result.impersonation)
    setCurrentPage('overview')
    setAuthError('')
  }

  async function handleStopImpersonation() {
    setAuthError('')
    try {
      const result = await stopUserImpersonation()
      setNotifications([])
      setUnreadCount(0)
      setNotificationPagination(null)
      setNotificationPage(1)
      setHasNewChatMessage(false)
      setUser(result.user)
      setImpersonation(null)
      setCurrentPage('users')
    } catch (error) { setAuthError(error.message || 'Could not end impersonation.') }
  }

  if (isLoading) {
    return <main className="loading-screen"><LoadingState label="Preparing your Orbit workspace" size="large" /></main>
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
        loginCooldownUntil={loginCooldownUntil}
      />
    )
  }

  return (
    <div className="workspace-layout">
      {impersonation && <div className="impersonation-banner" role="status"><div><strong>Viewing as {user.name}</strong><span>Admin {impersonation.administratorName} · {impersonation.reason}</span></div><button className="button button-primary" type="button" onClick={handleStopImpersonation}>Exit user view</button></div>}
      <HorizontalNavbar user={user} onSignOut={handleSignOut} signingOut={isSigningOut} notifications={notifications} unreadCount={unreadCount} pagination={notificationPagination} onNotificationPageChange={setNotificationPage} onOpenNotification={handleNotificationOpen} onMarkAllNotificationsRead={handleMarkAllNotificationsRead} />
      <div className="workspace-shell">
        <Navbar
          user={user}
          currentPage={currentPage}
          onNavigate={(page) => { setCurrentPage(page); setAuthError('') }}
        />
        {currentPage === 'inventory' && user.role === 'admin'
          ? <InventoryManagementPage />
          : currentPage === 'customers' && user.role === 'admin'
          ? <CustomerManagementPage />
          : currentPage === 'about'
          ? <AboutPage />
          : currentPage === 'tasks'
          ? <TaskPage user={user} />
          : currentPage === 'chat'
            ? <ChatPage user={user} />
          : currentPage === 'attendance'
            ? <AttendancePage user={user} />
          : currentPage === 'leaves'
            ? <LeavePage user={user} />
          : currentPage === 'email'
            ? <EmailPage user={user} />
          : currentPage === 'documents'
            ? <DocumentsPage user={user} />
          : currentPage === 'calendar'
            ? <CalendarPage user={user} />
          : currentPage === 'billing' && canAccessBilling(user)
            ? <BillingPage user={user} />
          : currentPage === 'profile'
          ? <ProfilePage user={user} onUserUpdated={setUser} notice={authError} />
          : user.role === 'admin' && currentPage === 'audit'
            ? <AuditEventsPage />
          : user.role === 'admin' && currentPage === 'overview'
            ? <AdminOverviewPage user={user} onNavigate={(page) => { setCurrentPage(page); setAuthError('') }} />
          : user.role === 'admin' && currentPage === 'users'
            ? <UserManagementPage currentUserId={user.id} onImpersonationStart={handleImpersonationStart} />
          : user.role === 'admin' && currentPage === 'organization'
            ? <OrganizationSettingsPage />
          : user.role === 'admin' && currentPage === 'reports'
            ? <AdminReportsPage />
          : user.role === 'admin' && currentPage === 'revenue'
            ? <RevenuePage />
            : user.role === 'admin' && currentPage !== 'overview'
              ? <AdminModulePage section={currentPage} />
              : <HomePage user={user} message={authError} onNavigate={(page) => { setCurrentPage(page); setAuthError('') }} onOpenNotification={handleNotificationOpen} />}
      </div>
      {hasNewChatMessage && currentPage !== 'chat' && <button className="floating-chat-notification" type="button" aria-label="New chat message. Open Team chat" title="New chat message" onClick={() => { setHasNewChatMessage(false); setCurrentPage('chat'); setAuthError('') }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.8-3.6A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8.5 10h7M8.5 13h5" /></svg>
        <span className="floating-chat-notification-dot" aria-hidden="true" />
      </button>}
    </div>
  )
}



















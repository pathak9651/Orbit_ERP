import { useEffect, useState } from 'react'
import AuthScreen from './components/auth/AuthScreen.jsx'
import HomePage from './components/dashboard/HomePage.jsx'
import AdminModulePage from './components/dashboard/AdminModulePage.jsx'
import UserManagementPage from './components/dashboard/UserManagementPage.jsx'
import OrganizationSettingsPage from './components/dashboard/OrganizationSettingsPage.jsx'
import TaskPage from './components/dashboard/TaskPage.jsx'
import AttendancePage from './components/dashboard/AttendancePage.jsx'
import LeavePage from './components/dashboard/LeavePage.jsx'
import ProfilePage from './components/profile/ProfilePage.jsx'
import Navbar from './components/layout/Navbar.jsx'
import HorizontalNavbar from './components/layout/HorizontalNavbar.jsx'
import { getCurrentUser, signIn, signOut, signUp } from './services/api.js'

export default function App() {
  const [authMode, setAuthMode] = useState('login')
  const [user, setUser] = useState(null)
  const [currentPage, setCurrentPage] = useState('overview')
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  useEffect(() => {
    let isMounted = true
    getCurrentUser()
      .then(({ user: currentUser }) => { if (isMounted) setUser(currentUser) })
      .catch(() => {})
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  const isAuthenticated = Boolean(user)

  useEffect(() => {
    if (!isAuthenticated || isSigningOut) return undefined
    let isActive = true

    async function refreshUser() {
      try {
        const { user: refreshedUser } = await getCurrentUser()
        if (!isActive) return
        setUser(refreshedUser)
        setCurrentPage((page) => refreshedUser.role !== 'admin' && !['overview', 'profile', 'tasks', 'attendance', 'leaves'].includes(page) ? 'overview' : page)
      } catch (error) {
        if (!isActive || (error.status !== 401 && error.status !== 403)) return
        setUser(null)
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
      setCurrentPage('overview')
      setAuthMode('login')
    } catch (error) {
      setAuthError(error.message || 'Could not sign out. Please try again.')
    } finally {
      setIsSigningOut(false)
    }
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
      <HorizontalNavbar user={user} onSignOut={handleSignOut} signingOut={isSigningOut} />
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



















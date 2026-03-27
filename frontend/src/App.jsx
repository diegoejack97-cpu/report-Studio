import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from './store/authStore'

import LandingPage    from './pages/LandingPage'
import LoginPage      from './pages/LoginPage'
import RegisterPage   from './pages/RegisterPage'
import DashboardPage  from './pages/DashboardPage'
import EditorPage     from './pages/EditorPage'
import PricingPage    from './pages/PricingPage'
import BillingPage    from './pages/BillingPage'
import ProfilePage    from './pages/ProfilePage'
import BillingSuccessPage from './pages/BillingSuccessPage'

const INACTIVITY_LIMIT_MS = 10 * 60 * 1000
const LAST_ACTIVITY_KEY = 'rs-last-activity'

function AuthBootstrap() {
  const hasHydrated = useAuthStore(s => s.hasHydrated)
  const token = useAuthStore(s => s.token)
  const refreshUser = useAuthStore(s => s.refreshUser)
  const logout = useAuthStore(s => s.logout)

  useEffect(() => {
    if (!hasHydrated || !token) return

    let canceled = false

    const syncUser = async () => {
      if (canceled) return
      try {
        await refreshUser()
      } catch {
        // refreshUser already handles logout on auth failure
      }
    }

    syncUser()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncUser()
      }
    }

    const handleFocus = () => {
      syncUser()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      canceled = true
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [hasHydrated, token, refreshUser])

  useEffect(() => {
    if (!hasHydrated || !token) return

    let timeoutId

    const expireSession = () => {
      toast.error('Sessão encerrada após 10 minutos de inatividade.')
      logout()
    }

    const scheduleLogout = (lastActivityValue) => {
      const lastActivity = Number(lastActivityValue) || Date.now()
      const remaining = INACTIVITY_LIMIT_MS - (Date.now() - lastActivity)

      window.clearTimeout(timeoutId)
      if (remaining <= 0) {
        expireSession()
        return
      }

      timeoutId = window.setTimeout(expireSession, remaining)
    }

    const markActivity = () => {
      const now = Date.now()
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now))
      scheduleLogout(now)
    }

    const handleStorage = event => {
      if (event.key !== LAST_ACTIVITY_KEY) return
      scheduleLogout(event.newValue)
    }

    const existingActivity = localStorage.getItem(LAST_ACTIVITY_KEY)
    if (existingActivity) scheduleLogout(existingActivity)
    else markActivity()

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove']
    activityEvents.forEach(eventName => {
      window.addEventListener(eventName, markActivity, { passive: true })
    })
    window.addEventListener('storage', handleStorage)

    return () => {
      window.clearTimeout(timeoutId)
      activityEvents.forEach(eventName => {
        window.removeEventListener(eventName, markActivity)
      })
      window.removeEventListener('storage', handleStorage)
    }
  }, [hasHydrated, logout, token])

  return null
}

function PrivateRoute({ children }) {
  const hasHydrated = useAuthStore(s => s.hasHydrated)
  const token = useAuthStore(s => s.token)
  if (!hasHydrated) return null
  return token ? children : <Navigate to="/login" replace />
}

function resolvePublicRedirect(search) {
  const params = new URLSearchParams(search)
  const redirectRaw = params.get('redirect')
  const plan = params.get('plan')

  if (redirectRaw && redirectRaw.startsWith('/') && !redirectRaw.startsWith('//')) {
    return redirectRaw
  }

  if (plan) {
    return `/pricing?plan=${encodeURIComponent(plan)}`
  }

  return '/dashboard'
}

function PublicOnlyRoute({ children }) {
  const hasHydrated = useAuthStore(s => s.hasHydrated)
  const token = useAuthStore(s => s.token)
  const location = useLocation()

  if (!hasHydrated) return null
  if (!token) return children

  return <Navigate to={resolvePublicRedirect(location.search)} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/billing" element={<PrivateRoute><BillingPage /></PrivateRoute>} />
        <Route path="/success" element={<BillingSuccessPage />} />
        <Route path="/billing/success" element={<BillingSuccessPage />} />
        <Route path="/login"    element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
        <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/editor"    element={<PrivateRoute><EditorPage /></PrivateRoute>} />
        <Route path="/editor/:id" element={<PrivateRoute><EditorPage /></PrivateRoute>} />
        <Route path="/profile"   element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

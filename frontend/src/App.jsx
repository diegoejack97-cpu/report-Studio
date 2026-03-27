import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'

import LandingPage    from './pages/LandingPage'
import LoginPage      from './pages/LoginPage'
import RegisterPage   from './pages/RegisterPage'
import DashboardPage  from './pages/DashboardPage'
import EditorPage     from './pages/EditorPage'
import PricingPage    from './pages/PricingPage'
import ProfilePage    from './pages/ProfilePage'
import BillingSuccessPage from './pages/BillingSuccessPage'

function AuthBootstrap() {
  const hasHydrated = useAuthStore(s => s.hasHydrated)
  const token = useAuthStore(s => s.token)
  const refreshUser = useAuthStore(s => s.refreshUser)

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

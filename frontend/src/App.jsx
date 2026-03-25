import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

import LandingPage    from './pages/LandingPage'
import LoginPage      from './pages/LoginPage'
import RegisterPage   from './pages/RegisterPage'
import DashboardPage  from './pages/DashboardPage'
import EditorPage     from './pages/EditorPage'
import PricingPage    from './pages/PricingPage'
import ProfilePage    from './pages/ProfilePage'
import BillingSuccessPage from './pages/BillingSuccessPage'

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token)
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
  const token = useAuthStore(s => s.token)
  const location = useLocation()

  if (!token) return children

  return <Navigate to={resolvePublicRedirect(location.search)} replace />
}

export default function App() {
  return (
    <BrowserRouter>
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

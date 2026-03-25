import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { LogOut, LayoutDashboard, Sun, Moon } from 'lucide-react'

export default function Navbar() {
  const { token, logout } = useAuthStore()
  const { dark, toggle } = useThemeStore()

  return (
    <nav style={{ background: 'var(--s1)', borderBottom: '1px solid var(--bd)' }}
      className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-4 md:px-8 backdrop-blur-md">
      <Link to="/" className="flex items-center gap-2 font-bold mr-auto" style={{ color: 'var(--tp)' }}>
        <span className="text-brand-400 text-lg">✦</span>
        <span className="tracking-tight">Report Flow</span>
      </Link>

      <div className="flex items-center gap-2">
        <Link to="/pricing" className="btn-ghost hidden sm:block">Preços</Link>

        {/* Toggle dark/light */}
        <button onClick={toggle} className="btn-ghost p-2 rounded-lg" title={dark ? 'Modo claro' : 'Modo escuro'}>
          {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-brand-400" />}
        </button>

        {token ? (
          <>
            <Link to="/dashboard" className="btn-ghost flex items-center gap-1.5">
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:block">Dashboard</span>
            </Link>
            <button onClick={logout} className="btn-ghost" style={{ color: 'var(--tm)' }}>
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <Link to="/login"    className="btn-ghost">Entrar</Link>
            <Link to="/register" className="btn-primary">Criar conta</Link>
          </>
        )}
      </div>
    </nav>
  )
}

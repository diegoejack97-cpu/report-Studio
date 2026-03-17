import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const redirectRaw = searchParams.get('redirect')
  const selectedPlan = searchParams.get('plan') || ''
  const emailFromQuery = searchParams.get('email') || ''
  const redirectTo = redirectRaw && redirectRaw.startsWith('/') && !redirectRaw.startsWith('//')
    ? redirectRaw
    : (selectedPlan ? `/pricing?plan=${encodeURIComponent(selectedPlan)}` : '/dashboard')

  useEffect(() => {
    if (emailFromQuery) {
      setEmail(emailFromQuery)
    }
    if (searchParams.get('upgraded') === 'true') {
      toast.success('Pagamento confirmado. Entre para acessar sua assinatura.')
    }
  }, [emailFromQuery, searchParams])

  const submit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setAuth(data.access_token, data.user)
      toast.success('Bem-vindo de volta!')
      navigate(redirectTo)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <Link to="/" className="flex items-center gap-2 justify-center mb-8 text-white font-bold text-lg">
          <span className="text-brand-400 text-xl">✦</span> Report Studio
        </Link>

        <div className="card p-6">
          <h1 className="text-xl font-bold text-white mb-1">Entrar</h1>
          <p className="text-ink-500 text-sm mb-6">Acesse sua conta</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs text-ink-400 font-medium block mb-1.5">Email</label>
              <input type="email" className="input-field" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
            </div>
            <div>
              <label className="text-xs text-ink-400 font-medium block mb-1.5">Senha</label>
              <input type="password" className="input-field" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-ink-500 text-sm mt-4">
          Não tem conta?{' '}
          <Link to={`/register${searchParams.toString() ? `?${searchParams.toString()}` : ''}`} className="text-brand-400 hover:text-brand-300">Criar grátis</Link>
        </p>
      </motion.div>
    </div>
  )
}

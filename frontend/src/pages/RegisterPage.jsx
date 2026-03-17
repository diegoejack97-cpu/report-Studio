import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'
import toast from 'react-hot-toast'

const PLAN_COPY = {
  individual_lite: {
    name: 'Individual Lite',
    subtitle: 'Sua conta será criada já preparada para concluir a assinatura deste plano.',
    cta: 'Continuar para pagamento',
    highlights: ['8 relatórios por mês', '1 dashboard', 'Suporte por email'],
  },
  individual_pro: {
    name: 'Individual Pro',
    subtitle: 'Sua conta será criada já preparada para concluir a assinatura deste plano.',
    cta: 'Continuar para pagamento',
    highlights: ['30 relatórios por mês', 'Até 3 dashboards', 'Suporte em até 24h'],
  },
  individual_plus: {
    name: 'Individual Plus',
    subtitle: 'Sua conta será criada já preparada para concluir a assinatura deste plano.',
    cta: 'Continuar para pagamento',
    highlights: ['80 relatórios por mês', 'Dashboards ilimitados', 'Prioridade no suporte'],
  },
  starter: {
    name: 'Individual Lite',
    subtitle: 'Sua conta será criada já preparada para concluir a assinatura deste plano.',
    cta: 'Continuar para pagamento',
    highlights: ['8 relatórios por mês', '1 dashboard', 'Suporte por email'],
  },
  pro: {
    name: 'Individual Pro',
    subtitle: 'Sua conta será criada já preparada para concluir a assinatura deste plano.',
    cta: 'Continuar para pagamento',
    highlights: ['30 relatórios por mês', 'Até 3 dashboards', 'Suporte em até 24h'],
  },
  business: {
    name: 'Individual Plus',
    subtitle: 'Sua conta será criada já preparada para concluir a assinatura deste plano.',
    cta: 'Continuar para pagamento',
    highlights: ['80 relatórios por mês', 'Dashboards ilimitados', 'Prioridade no suporte'],
  },
}

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', full_name: '' })
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const selectedPlanParam = searchParams.get('plan') || ''
  const redirectRaw = searchParams.get('redirect')
  const emailFromQuery = searchParams.get('email') || ''
  const redirectTo = redirectRaw && redirectRaw.startsWith('/') && !redirectRaw.startsWith('//')
    ? redirectRaw
    : '/dashboard'
  const selectedPlan = useMemo(() => {
    if (selectedPlanParam) return selectedPlanParam

    try {
      const url = new URL(redirectTo, window.location.origin)
      return url.searchParams.get('plan') || ''
    } catch {
      return ''
    }
  }, [redirectTo, selectedPlanParam])
  const planCopy = PLAN_COPY[selectedPlan]

  useEffect(() => {
    if (emailFromQuery) {
      setForm(current => ({ ...current, email: emailFromQuery }))
    }
  }, [emailFromQuery])

  const persistAuthSilently = (token, user) => {
    localStorage.setItem('rs-auth', JSON.stringify({
      state: { token, user },
      version: 0,
    }))
  }

  const update = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async e => {
    e.preventDefault()
    if (form.password.length < 8) { toast.error('Senha mínima: 8 caracteres'); return }
    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', form)

      if (selectedPlan) {
        const payload = { plan: selectedPlan, plan_name: selectedPlan }
        const headers = { Authorization: `Bearer ${data.access_token}` }
        let checkoutResponse

        try {
          checkoutResponse = await api.post('/billing/create-checkout-session', payload, { headers })
        } catch (err) {
          if (err?.response?.status === 404) {
            checkoutResponse = await api.post('/billing/checkout', payload, { headers })
          } else {
            throw err
          }
        }

        const checkoutUrl = checkoutResponse?.data?.checkout_url || checkoutResponse?.data?.url
        if (!checkoutUrl) {
          throw new Error('Checkout não retornou URL')
        }

        persistAuthSilently(data.access_token, data.user)
        toast.success(`Conta criada! Abrindo pagamento do plano ${planCopy?.name || 'selecionado'}.`)
        window.location.assign(checkoutUrl)
        return
      }

      setAuth(data.access_token, data.user)
      toast.success('Conta criada! 3 relatórios grátis disponíveis.')
      navigate(redirectTo, { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar conta')
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
          <h1 className="text-xl font-bold text-white mb-1">Criar conta</h1>
          {planCopy ? (
            <div className="mb-6">
              <p className="text-ink-300 text-sm font-medium">{planCopy.name}</p>
              <p className="text-ink-500 text-sm mt-1">{planCopy.subtitle}</p>
              <div className="mt-3 rounded-xl border border-brand-700/30 bg-brand-950/20 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">Beneficios do plano</p>
                <ul className="mt-2 space-y-1.5 text-sm text-ink-300">
                  {planCopy.highlights.map(item => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-ink-500 text-sm mb-6">3 relatórios grátis, sem cartão</p>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs text-ink-400 font-medium block mb-1.5">Nome</label>
              <input className="input-field" value={form.full_name} onChange={update('full_name')} placeholder="Seu nome" />
            </div>
            <div>
              <label className="text-xs text-ink-400 font-medium block mb-1.5">Email</label>
              <input type="email" className="input-field" value={form.email} onChange={update('email')} placeholder="seu@email.com" required />
            </div>
            <div>
              <label className="text-xs text-ink-400 font-medium block mb-1.5">Senha</label>
              <input type="password" className="input-field" value={form.password} onChange={update('password')} placeholder="Mínimo 8 caracteres" required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2">
              {loading ? 'Criando...' : (planCopy?.cta || 'Criar conta grátis')}
            </button>
          </form>
        </div>

        <p className="text-center text-ink-500 text-sm mt-4">
          Já tem conta?{' '}
          <Link to={`/login${searchParams.toString() ? `?${searchParams.toString()}` : ''}`} className="text-brand-400 hover:text-brand-300">Entrar</Link>
        </p>
      </motion.div>
    </div>
  )
}

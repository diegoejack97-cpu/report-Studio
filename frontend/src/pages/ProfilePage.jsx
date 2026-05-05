import { useState } from 'react'
import { motion } from 'motion/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { User, Lock, CreditCard, LogOut, ArrowLeft, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { buildAppUrl } from '@/lib/appUrl'
import { useAuthStore } from '@/store/authStore'
import Navbar from '@/components/layout/Navbar'

const PLAN_LABELS = {
  free: 'Gratuito',
  starter: 'Individual Lite',
  pro: 'Individual Pro',
  business: 'Individual Plus',
}
const PLAN_COLORS = {
  free: 'text-ink-400',
  starter: 'text-brand-400',
  pro: 'text-violet-400',
  business: 'text-amber-400',
}
const PLAN_RANK = {
  free: 0,
  starter: 1,
  individual_lite: 1,
  pro: 2,
  individual_pro: 2,
  business: 3,
  individual_plus: 3,
}

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuthStore()
  const navigate = useNavigate()

  const [name, setName] = useState(user?.full_name || '')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [tab, setTab] = useState('profile')

  const { data: billing } = useQuery({
    queryKey: ['billing'],
    queryFn: () => api.get('/billing/status').then(r => r.data),
  })

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans/').then(r => r.data),
  })

  const profileMut = useMutation({
    mutationFn: data => api.put('/users/me', data),
    onSuccess: async () => { await refreshUser(); toast.success('Perfil atualizado!') },
    onError: err => toast.error(err.response?.data?.detail || 'Erro ao salvar'),
  })

  const portalMut = useMutation({
    mutationFn: () => api.post('/billing/portal', { return_url: window.location.href }),
    onSuccess: data => { window.location.href = data.data.portal_url },
    onError: () => toast.error('Erro ao abrir portal de faturamento'),
  })

  const checkoutMut = useMutation({
    mutationFn: plan => api.post('/billing/checkout', { plan, success_url: buildAppUrl('/billing/success'), cancel_url: buildAppUrl('/profile') }),
    onSuccess: data => { window.location.href = data.data.checkout_url },
    onError: err => toast.error(err.response?.data?.detail || 'Erro ao abrir checkout'),
  })

  const handleSaveProfile = e => {
    e.preventDefault()
    const payload = { full_name: name }
    if (newPw) {
      if (newPw.length < 8) { toast.error('Nova senha: mínimo 8 caracteres'); return }
      payload.current_password = curPw
      payload.new_password = newPw
    }
    profileMut.mutate(payload)
    setCurPw(''); setNewPw('')
  }

  const currentPlanRank = PLAN_RANK[user?.plan] ?? 0
  const getPlanRank = plan => PLAN_RANK[plan.id] ?? 0
  const isCurrentPlan = plan => plan.id === user?.plan || plan.current_plan_ids?.includes(user?.plan)
  const getPlanActionLabel = plan => {
    const isCurrent = isCurrentPlan(plan)
    if (isCurrent) return 'Plano atual'
    if (getPlanRank(plan) > currentPlanRank) return `Fazer upgrade para ${plan.name}`
    if (getPlanRank(plan) < currentPlanRank) return `Fazer downgrade para ${plan.name}`
    return `Assinar ${plan.name}`
  }

  const handlePlanAction = plan => {
    const isCurrent = isCurrentPlan(plan)
    if (isCurrent) return

    if (getPlanRank(plan) < currentPlanRank) {
      toast('O downgrade é feito pelo portal de faturamento.')
      portalMut.mutate()
      return
    }

    checkoutMut.mutate(plan.id)
  }

  return (
    <div className="min-h-screen bg-[var(--s0)]">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-20 pb-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => navigate('/dashboard')} className="btn-ghost p-2 text-ink-400">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-xl font-bold text-[color:var(--tp)]">Configurações da conta</h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-[var(--s1)] p-1 rounded-xl border border-theme w-fit">
            {[
              { id: 'profile', icon: <User className="w-4 h-4" />, label: 'Perfil' },
              { id: 'plan',    icon: <CreditCard className="w-4 h-4" />, label: 'Plano' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-brand-600 text-white' : 'text-[color:var(--ts)] hover:text-[color:var(--tp)]'}`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Profile tab */}
          {tab === 'profile' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6 space-y-6">
              <div>
                <h2 className="text-base font-bold text-[color:var(--tp)] mb-1">Informações pessoais</h2>
                <p className="text-ink-500 text-sm">Atualize seu nome e senha</p>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="text-xs text-ink-400 font-medium block mb-1.5">Nome completo</label>
                  <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" />
                </div>
                <div>
                  <label className="text-xs text-ink-400 font-medium block mb-1.5">Email</label>
                  <input className="input-field opacity-50 cursor-not-allowed" value={user?.email || ''} disabled />
                  <p className="text-[10px] text-ink-600 mt-1">O email não pode ser alterado</p>
                </div>

                <div className="border-t border-theme pt-4">
                  <h3 className="text-sm font-semibold text-[color:var(--tp)] mb-3 flex items-center gap-2">
                    <Lock className="w-4 h-4" /> Alterar senha
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-ink-400 font-medium block mb-1.5">Senha atual</label>
                      <input type="password" className="input-field" value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="••••••••" />
                    </div>
                    <div>
                      <label className="text-xs text-ink-400 font-medium block mb-1.5">Nova senha</label>
                      <input type="password" className="input-field" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Mínimo 8 caracteres" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => { if (confirm('Sair da conta?')) logout() }}
                    className="btn-ghost text-red-400 hover:text-red-300 text-sm flex items-center gap-1.5"
                  >
                    <LogOut className="w-4 h-4" /> Sair
                  </button>
                  <button type="submit" disabled={profileMut.isPending} className="btn-primary">
                    {profileMut.isPending ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* Plan tab */}
          {tab === 'plan' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {/* Current status */}
              <div className="card p-5">
                <h2 className="text-base font-bold text-[color:var(--tp)] mb-4">Status da assinatura</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[var(--s2)] rounded-xl p-4">
                    <p className="text-xs text-ink-500 mb-1">Plano atual</p>
                    <p className={`text-lg font-bold ${PLAN_COLORS[user?.plan] || 'text-[color:var(--tp)]'}`}>
                      {PLAN_LABELS[user?.plan] || '—'}
                    </p>
                  </div>
                  <div className="bg-[var(--s2)] rounded-xl p-4">
                    <p className="text-xs text-ink-500 mb-1">Uso este mês</p>
                    <p className="text-lg font-bold text-[color:var(--tp)] font-mono">
                      {billing?.reports_this_month || 0}
                      <span className="text-ink-500 text-sm font-normal"> / {billing?.plan_limit >= 9999 ? '∞' : billing?.plan_limit}</span>
                    </p>
                  </div>
                  <div className="bg-[var(--s2)] rounded-xl p-4">
                    <p className="text-xs text-ink-500 mb-1">Status</p>
                    <p className={`text-sm font-semibold ${billing?.subscription_status === 'active' ? 'text-green-400' : 'text-ink-400'}`}>
                      {billing?.subscription_status === 'active' ? '✓ Ativo' : billing?.subscription_status || 'Gratuito'}
                    </p>
                  </div>
                  <div className="bg-[var(--s2)] rounded-xl p-4">
                    <p className="text-xs text-ink-500 mb-1">Expira em</p>
                    <p className="text-sm font-semibold text-[color:var(--tp)]">
                      {billing?.plan_expires_at ? new Date(billing.plan_expires_at).toLocaleDateString('pt-BR') : '—'}
                    </p>
                  </div>
                </div>

                {user?.plan !== 'free' && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link to="/billing" className="btn-primary text-sm">
                      Comparar upgrade e downgrade
                    </Link>
                    <button
                      onClick={() => portalMut.mutate()}
                      disabled={portalMut.isPending}
                      className="btn-outline text-sm flex items-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      {portalMut.isPending ? 'Abrindo...' : 'Gerenciar assinatura / cancelar'}
                    </button>
                  </div>
                )}
              </div>

              {/* Plan cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {plans.filter(p => p.self_service && p.id !== 'free').map(plan => {
                  const isCurrent = isCurrentPlan(plan)
                  return (
                    <div key={plan.id} className={`card p-4 ${isCurrent ? 'border-brand-600' : ''}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-[color:var(--tp)] font-bold">{plan.name}</span>
                          {isCurrent && <span className="ml-2 badge bg-brand-900 text-brand-300 text-[10px]">Atual</span>}
                        </div>
                        <span className="text-xl font-extrabold text-[color:var(--tp)]">R$ {plan.price_brl}<span className="text-ink-500 text-xs font-normal">/mês</span></span>
                      </div>
                      <ul className="space-y-1.5 mb-4">
                        {plan.features.slice(0, 4).map((f, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-xs text-ink-400">
                            <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" /> {f}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => handlePlanAction(plan)}
                        disabled={isCurrent || checkoutMut.isPending || portalMut.isPending}
                        className={`w-full py-2 rounded-lg text-sm font-semibold transition-all ${isCurrent ? 'bg-[var(--s3)] text-ink-500 cursor-default' : 'bg-brand-600 hover:bg-brand-500 text-white active:scale-95'}`}
                      >
                        {isCurrent ? '✓ Plano atual' : getPlanActionLabel(plan)}
                      </button>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  )
}

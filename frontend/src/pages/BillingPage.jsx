import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, CreditCard, RefreshCcw, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { buildAppUrl } from '@/lib/appUrl'
import { useAuthStore } from '@/store/authStore'
import Navbar from '@/components/layout/Navbar'

const PLAN_RANK = {
  free: 0,
  starter: 1,
  individual_lite: 1,
  pro: 2,
  individual_pro: 2,
  business: 3,
  individual_plus: 3,
}

export default function BillingPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const refreshUser = useAuthStore(s => s.refreshUser)

  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.get('/billing/status').then(r => r.data),
  })

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans/').then(r => r.data),
  })

  const refreshBilling = async (message) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['billing-status'] }),
      qc.invalidateQueries({ queryKey: ['plans'] }),
      refreshUser(),
    ])
    if (message) toast.success(message)
  }

  const checkoutMut = useMutation({
    mutationFn: pricePlanId => api.post('/billing/create-checkout-session', {
      plan: pricePlanId,
      success_url: buildAppUrl('/billing/success'),
      cancel_url: buildAppUrl('/billing'),
    }),
    onSuccess: ({ data }) => {
      window.location.assign(data.checkout_url)
    },
    onError: err => toast.error(err?.response?.data?.detail || 'Erro ao iniciar checkout'),
  })

  const cancelMut = useMutation({
    mutationFn: () => api.post('/billing/cancel'),
    onSuccess: () => refreshBilling('Cancelamento agendado com sucesso.'),
    onError: err => toast.error(err?.response?.data?.detail || 'Erro ao cancelar assinatura'),
  })

  const resumeMut = useMutation({
    mutationFn: () => api.post('/billing/resume'),
    onSuccess: () => refreshBilling('Assinatura reativada com sucesso.'),
    onError: err => toast.error(err?.response?.data?.detail || 'Erro ao reativar assinatura'),
  })

  const upgradeMut = useMutation({
    mutationFn: new_price_id => api.post('/billing/upgrade', { new_price_id }),
    onSuccess: () => refreshBilling('Upgrade aplicado imediatamente.'),
    onError: err => toast.error(err?.response?.data?.detail || 'Erro ao aplicar upgrade'),
  })

  const downgradeMut = useMutation({
    mutationFn: new_price_id => api.post('/billing/downgrade', { new_price_id }),
    onSuccess: () => refreshBilling('Downgrade será aplicado no próximo ciclo.'),
    onError: err => toast.error(err?.response?.data?.detail || 'Erro ao agendar downgrade'),
  })

  const currentPlanRank = PLAN_RANK[billing?.current_plan] ?? 0
  const currentPeriodDate = billing?.current_period_end
    ? new Date(billing.current_period_end).toLocaleDateString('pt-BR')
    : null

  const selfServicePlans = useMemo(
    () => plans.filter(plan => plan.self_service),
    [plans]
  )

  const isBusy =
    checkoutMut.isPending ||
    cancelMut.isPending ||
    resumeMut.isPending ||
    upgradeMut.isPending ||
    downgradeMut.isPending

  const getPlanRank = plan => PLAN_RANK[plan.id] ?? 0
  const isCurrentPlan = plan => plan.id === billing?.current_plan || plan.current_plan_ids?.includes(billing?.current_plan)

  const handlePlanAction = plan => {
    if (!plan.stripe_price_id || isBusy) return
    if (isCurrentPlan(plan)) return

    const nextRank = getPlanRank(plan)
    if ((billing?.current_plan || 'free') === 'free') {
      checkoutMut.mutate(plan.id)
      return
    }

    if (nextRank > currentPlanRank) {
      upgradeMut.mutate(plan.stripe_price_id)
      return
    }

    if (nextRank < currentPlanRank) {
      downgradeMut.mutate(plan.stripe_price_id)
    }
  }

  const getActionLabel = plan => {
    if (isCurrentPlan(plan)) return 'Plano atual'
    if ((billing?.current_plan || 'free') === 'free') return `Assinar ${plan.name}`
    if (getPlanRank(plan) > currentPlanRank) return `Fazer upgrade para ${plan.name}`
    if (getPlanRank(plan) < currentPlanRank) return `Agendar downgrade para ${plan.name}`
    return `Trocar para ${plan.name}`
  }

  return (
    <div className="min-h-screen bg-surface-0">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 pt-20 pb-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => navigate('/dashboard')} className="btn-ghost p-2 text-ink-400">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Gerenciar assinatura</h1>
              <p className="text-ink-500 text-sm">Upgrade imediato, downgrade no próximo ciclo e cancelamento seguro.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 card p-5">
              <h2 className="text-base font-bold text-white mb-4">Resumo atual</h2>

              {billingLoading ? (
                <div className="space-y-3">
                  <div className="h-10 rounded-lg bg-surface-2 animate-pulse" />
                  <div className="h-10 rounded-lg bg-surface-2 animate-pulse" />
                  <div className="h-10 rounded-lg bg-surface-2 animate-pulse" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl bg-surface-2 p-4">
                    <p className="text-xs text-ink-500 mb-1">Plano atual</p>
                    <p className="text-lg font-bold text-white capitalize">{billing?.current_plan || 'free'}</p>
                  </div>

                  <div className="rounded-xl bg-surface-2 p-4">
                    <p className="text-xs text-ink-500 mb-1">Status</p>
                    <p className="text-sm font-semibold text-white">
                      {billing?.cancel_at_period_end ? 'Cancelando no fim do ciclo' : (billing?.subscription_status || 'inactive')}
                    </p>
                  </div>

                  <div className="rounded-xl bg-surface-2 p-4">
                    <p className="text-xs text-ink-500 mb-1">Renovação / fim do ciclo</p>
                    <p className="text-sm font-semibold text-white">{currentPeriodDate || '—'}</p>
                  </div>

                  <div className="rounded-xl bg-surface-2 p-4">
                    <p className="text-xs text-ink-500 mb-1">Uso atual</p>
                    <p className="text-sm font-semibold text-white">
                      {billing?.reports_used || 0} / {billing?.reports_limit >= 9999 ? '∞' : billing?.reports_limit || 0} relatórios
                    </p>
                  </div>

                  {billing?.cancel_at_period_end && currentPeriodDate && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                      Seu plano será cancelado em {currentPeriodDate}.
                    </div>
                  )}

                  {!!billing?.pending_price_id && (
                    <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 text-sm text-brand-200">
                      Downgrade agendado para o próximo ciclo.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    {!billing?.cancel_at_period_end && billing?.current_plan !== 'free' && (
                      <button
                        onClick={() => cancelMut.mutate()}
                        disabled={isBusy}
                        className="btn-outline text-sm flex items-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        {cancelMut.isPending ? 'Cancelando...' : 'Cancelar plano'}
                      </button>
                    )}

                    {billing?.cancel_at_period_end && (
                      <button
                        onClick={() => resumeMut.mutate()}
                        disabled={isBusy}
                        className="btn-primary text-sm flex items-center gap-2"
                      >
                        <RefreshCcw className="w-4 h-4" />
                        {resumeMut.isPending ? 'Reativando...' : 'Reativar plano'}
                      </button>
                    )}

                    <Link to="/pricing" className="btn-ghost text-sm">
                      Ver página pública de preços
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(plansLoading ? Array.from({ length: 3 }) : selfServicePlans).map((plan, index) => {
                  if (!plan) {
                    return <div key={index} className="card p-5 h-64 animate-pulse bg-surface-2" />
                  }

                  const current = isCurrentPlan(plan)
                  return (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.06 }}
                      className={`card p-5 ${current ? 'border-brand-600' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                          <p className="text-ink-500 text-xs">{plan.reports_per_month} relatórios / mês</p>
                        </div>
                        {current && <span className="badge bg-brand-900 text-brand-300">Atual</span>}
                      </div>

                      <ul className="space-y-2 mb-6">
                        {plan.features.slice(0, 4).map(feature => (
                          <li key={feature} className="flex items-start gap-2 text-sm text-ink-300">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>

                      <button
                        onClick={() => handlePlanAction(plan)}
                        disabled={current || isBusy}
                        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                          current
                            ? 'bg-surface-3 text-ink-500 cursor-default'
                            : 'bg-brand-600 hover:bg-brand-500 text-white'
                        }`}
                      >
                        {checkoutMut.isPending && !current ? 'Abrindo checkout...' : getActionLabel(plan)}
                      </button>
                    </motion.div>
                  )
                })}
              </div>

              <div className="mt-6 card p-5">
                <div className="flex items-center gap-2 text-white font-semibold mb-2">
                  <CreditCard className="w-4 h-4 text-brand-400" />
                  Regras aplicadas
                </div>
                <p className="text-sm text-ink-400">
                  Upgrade aplicado imediatamente. Downgrade agendado para o próximo ciclo. Cancelamento preserva o acesso até o fim do período já pago.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

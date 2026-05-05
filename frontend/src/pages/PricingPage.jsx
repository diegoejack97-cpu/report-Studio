import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { buildAppUrl } from '@/lib/appUrl'
import { useAuthStore } from '@/store/authStore'
import Navbar from '@/components/layout/Navbar'
import EmbeddedCheckoutModal from '@/components/billing/EmbeddedCheckoutModal'

const PLAN_RANK = {
  free: 0,
  starter: 1,
  individual_lite: 1,
  pro: 2,
  individual_pro: 2,
  business: 3,
  individual_plus: 3,
}

export default function PricingPage() {
  const { token, user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const autoCheckoutStartedRef = useRef(false)
  const [processingPlanId, setProcessingPlanId] = useState(null)
  const [embeddedCheckoutPlan, setEmbeddedCheckoutPlan] = useState(null)
  const [embeddedCheckoutData, setEmbeddedCheckoutData] = useState(null)
  const [embeddedCheckoutLoading, setEmbeddedCheckoutLoading] = useState(false)

  const { data: plans = [], isError: plansError, error: plansQueryError } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans/').then(r => r.data),
  })

  const { data: billingConfig } = useQuery({
    queryKey: ['billing-public-config'],
    queryFn: () => api.get('/billing/public-config').then(r => r.data),
  })

  const startHostedCheckout = useCallback(async (planId) => {
    const payload = {
      plan: planId,
      success_url: buildAppUrl('/billing/success'),
      cancel_url: buildAppUrl('/pricing'),
    }

    setProcessingPlanId(planId)
    try {
      let response
      if (token) {
        try {
          response = await api.post('/billing/create-checkout-session', payload)
        } catch (err) {
          if (err?.response?.status === 404) {
            response = await api.post('/billing/checkout', payload)
          } else {
            throw err
          }
        }
      } else {
        response = await api.post('/billing/create-checkout-session-public', payload)
      }

      const checkoutUrl = response?.data?.checkout_url || response?.data?.url
      if (!checkoutUrl) {
        toast.error('Checkout não retornou URL')
        return
      }

      window.location.assign(checkoutUrl)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao abrir checkout')
    } finally {
      setProcessingPlanId(null)
    }
  }, [token])

  const startEmbeddedCheckout = useCallback(async plan => {
    setEmbeddedCheckoutPlan(plan)
    setEmbeddedCheckoutData(null)
    setEmbeddedCheckoutLoading(true)

    try {
      const response = await api.post('/billing/create-checkout-session', {
        plan_name: plan.id,
      })
      const checkoutUrl = response?.data?.checkout_url
      if (!checkoutUrl) {
        toast.error('Checkout não retornou URL')
        return
      }
      window.location.assign(checkoutUrl)
    } catch (err) {
      setEmbeddedCheckoutPlan(null)
      toast.error(err?.response?.data?.detail || 'Erro ao preparar pagamento')
    } finally {
      setEmbeddedCheckoutLoading(false)
    }
  }, [token])

  const closeEmbeddedCheckout = useCallback(() => {
    if (embeddedCheckoutLoading) return
    setEmbeddedCheckoutPlan(null)
    setEmbeddedCheckoutData(null)
  }, [embeddedCheckoutLoading])

  const openBillingPortal = useCallback(async () => {
    try {
      const { data } = await api.post('/billing/portal', { return_url: window.location.href })
      if (!data?.portal_url) {
        toast.error('Portal de faturamento indisponível no momento')
        return
      }
      window.location.assign(data.portal_url)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao abrir portal de faturamento')
    }
  }, [])

  const plansBySegment = plans.reduce((acc, plan) => {
    const key = plan.segment || 'individual'
    if (!acc[key]) acc[key] = []
    acc[key].push(plan)
    return acc
  }, {})

  const isCurrentPlan = plan => {
    if (!user?.plan) return false
    if (plan.id === user.plan) return true
    return Array.isArray(plan.current_plan_ids) && plan.current_plan_ids.includes(user.plan)
  }

  const getPlanRank = plan => PLAN_RANK[plan.id] ?? 0
  const currentPlanRank = PLAN_RANK[user?.plan] ?? 0

  const getPlanActionLabel = plan => {
    if (isCurrentPlan(plan)) return 'Plano atual'
    if (!token) return plan.id === 'free' ? 'Começar grátis' : 'Criar conta e continuar'
    if (plan.id === 'free' && currentPlanRank > 0) return 'Fazer downgrade'
    if (getPlanRank(plan) > currentPlanRank) return 'Fazer upgrade'
    if (getPlanRank(plan) < currentPlanRank) return 'Fazer downgrade'
    return plan.cta || 'Selecionar plano'
  }

  const handlePlan = plan => {
    if (plan.id === 'free') {
      if (token && currentPlanRank > 0) {
        openBillingPortal()
        return
      }
      window.location.assign(token ? '/dashboard' : '/register')
      return
    }

    if (!plan.self_service) {
      const subject = encodeURIComponent(`Plano ${plan.name} - Report Flow`)
      window.location.href = `mailto:sales@reportstudio.com?subject=${subject}`
      return
    }

    if (isCurrentPlan(plan)) {
      toast('Você já está neste plano')
      return
    }

    if (!token) {
      window.location.assign(`/register?plan=${encodeURIComponent(plan.id)}`)
      return
    }

    if (getPlanRank(plan) < currentPlanRank) {
      toast('Para downgrade, use o portal de faturamento.')
      openBillingPortal()
      return
    }

    if (billingConfig?.embedded_checkout_enabled) {
      setEmbeddedCheckoutPlan(plan)
      setEmbeddedCheckoutData(null)
      startEmbeddedCheckout(plan)
      return
    }

    startHostedCheckout(plan.id)
  }

  useEffect(() => {
    if (!token || processingPlanId || autoCheckoutStartedRef.current) return

    const requestedPlan = searchParams.get('plan')
    if (!requestedPlan) return

    const plan = plans.find(item => item.id === requestedPlan)
    if (!plan || !plan.self_service) return

    autoCheckoutStartedRef.current = true
    if (isCurrentPlan(plan)) {
      toast('Você já está neste plano')
      return
    }

    if (getPlanRank(plan) < currentPlanRank) {
      toast('Para downgrade, use o portal de faturamento.')
      openBillingPortal()
      return
    }

    if (billingConfig?.embedded_checkout_enabled) {
      startEmbeddedCheckout(plan)
      return
    }

    startHostedCheckout(plan.id)
  }, [token, plans, searchParams, processingPlanId, startHostedCheckout, startEmbeddedCheckout, billingConfig, currentPlanRank, openBillingPortal])

  return (
    <div className="min-h-screen bg-[var(--s0)]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 pt-24 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-[color:var(--tp)] mb-4">
            Estrutura de planos
          </h1>
          <p className="text-[color:var(--ts)] text-lg max-w-xl mx-auto">
            3 planos individuais self-service para começar e escalar no seu ritmo.
          </p>
        </motion.div>

        {plansError && (
          <div className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
            Não foi possível carregar os planos da API.
            {plansQueryError?.message ? ` Detalhe: ${plansQueryError.message}` : ''}
          </div>
        )}

        {!!plansBySegment.individual?.length && (
          <div>
            <div className="mb-5">
              <h2 className="text-2xl font-bold text-[color:var(--tp)]">Planos Individuais</h2>
              <p className="text-ink-500 text-sm mt-1">
                {billingConfig?.embedded_checkout_enabled ? 'Ativação imediata com pagamento incorporado' : 'Ativação imediata via checkout'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plansBySegment.individual.map((plan, i) => {
                const isCurrent = isCurrentPlan(plan)
                const isHighlighted = plan.highlighted

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={`relative rounded-2xl p-6 border flex flex-col ${
                      isHighlighted
                        ? 'border-brand-600 bg-[var(--s2)] ring-1 ring-brand-600/30'
                        : 'border-theme bg-[var(--s1)]'
                    }`}
                  >
                    {isHighlighted && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-brand-600 text-white text-xs font-bold">
                        Mais popular
                      </div>
                    )}

                    {isCurrent && (
                      <div className="absolute -top-3 right-4 px-3 py-1 rounded-full bg-green-700 text-white text-xs font-bold">
                        Plano atual
                      </div>
                    )}

                    <div className="mb-6">
                      <h3 className="text-base font-bold text-[color:var(--tp)] mb-1">{plan.name}</h3>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-4xl font-extrabold text-[color:var(--tp)]">
                          {plan.price_brl === 0 ? 'Grátis' : `R$\u00a0${plan.price_brl}`}
                        </span>
                        {plan.price_brl > 0 && <span className="text-ink-500 text-sm">/mês</span>}
                      </div>
                      <p className="text-ink-500 text-xs">
                        {plan.reports_per_month >= 9999 ? 'Relatórios sob contrato' : `${plan.reports_per_month} relatórios/mês`}
                      </p>
                      <p className="text-ink-600 text-xs mt-1">
                        {plan.included_users} usuário{plan.included_users > 1 ? 's' : ''} incluso{plan.included_users > 1 ? 's' : ''}
                        {plan.extra_user_price_brl ? ` · +R$ ${plan.extra_user_price_brl}/usuário` : ''}
                      </p>
                    </div>

                    <ul className="space-y-2.5 flex-1 mb-6">
                      {plan.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isHighlighted ? 'text-brand-400' : 'text-green-500'}`} />
                          <span className="text-[color:var(--ts)]">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handlePlan(plan)}
                      disabled={(isCurrent && plan.self_service) || !!processingPlanId || embeddedCheckoutLoading}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                        isCurrent && plan.self_service
                          ? 'bg-[var(--s3)] text-ink-500 cursor-default'
                          : isHighlighted
                            ? 'bg-brand-600 hover:bg-brand-500 text-white active:scale-95'
                            : 'border border-theme hover:border-[color:var(--bdh)] text-[color:var(--ts)] hover:text-[color:var(--tp)] hover:bg-[var(--s2)] active:scale-95'
                      }`}
                    >
                      {isCurrent && plan.self_service
                        ? '✓ Plano atual'
                        : processingPlanId === plan.id
                          ? 'Abrindo checkout...'
                          : embeddedCheckoutLoading && embeddedCheckoutPlan?.id === plan.id
                            ? 'Preparando pagamento...'
                            : getPlanActionLabel(plan)}
                      {(!isCurrent || !plan.self_service) && <ArrowRight className="w-3.5 h-3.5" />}
                    </button>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="mt-10 rounded-3xl border border-brand-700/30 bg-gradient-to-br from-brand-950/80 via-[var(--s2)] to-[var(--s1)] p-8 md:p-10"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl md:text-3xl font-bold text-[color:var(--tp)]">Soluções empresariais</h2>
              <p className="mt-3 text-base leading-relaxed text-[color:var(--ts)]">
                Soluções personalizadas para equipes e grandes volumes. Entre em contato com nosso time para uma proposta sob medida.
              </p>
            </div>

            <Link to="/contato" className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-3 text-base">
              Falar com vendas
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-20 grid md:grid-cols-2 gap-8 max-w-4xl mx-auto"
        >
          {[
            { q: 'Como funciona para solução empresarial?', a: 'O atendimento comercial avalia equipe, volume e necessidades operacionais para montar uma proposta sob medida.' },
            { q: 'Quais planos são self-service?', a: 'Apenas os três planos individuais: Lite, Pro e Plus.' },
            { q: 'Posso migrar de individual para empresarial?', a: 'Sim. Nosso time comercial pode orientar a transição para uma solução adequada ao seu cenário.' },
            { q: 'Aceita cartão de crédito/débito?', a: billingConfig?.embedded_checkout_enabled ? 'Sim. Os planos individuais usam Stripe com formulário incorporado nesta página.' : 'Sim, para planos individuais via Stripe. Soluções empresariais seguem atendimento comercial.' },
          ].map((item, i) => (
            <div key={i} className="card p-5">
              <h4 className="text-[color:var(--tp)] font-semibold mb-2 text-sm">{item.q}</h4>
              <p className="text-ink-500 text-sm leading-relaxed">{item.a}</p>
            </div>
          ))}
        </motion.div>
      </div>

      <EmbeddedCheckoutModal
        open={!!embeddedCheckoutPlan}
        onOpenChange={open => {
          if (!open) closeEmbeddedCheckout()
        }}
        sessionData={embeddedCheckoutData}
        loading={embeddedCheckoutLoading}
        embedded={!!billingConfig?.embedded_checkout_enabled}
        guestEmail=""
        setGuestEmail={null}
        onStart={() => {
          if (!embeddedCheckoutPlan) return
          if (billingConfig?.embedded_checkout_enabled) return
          startHostedCheckout(embeddedCheckoutPlan.id)
        }}
        planName={embeddedCheckoutPlan?.name || 'selecionado'}
      />
    </div>
  )
}

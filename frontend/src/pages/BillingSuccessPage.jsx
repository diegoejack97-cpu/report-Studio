import { useEffect } from 'react'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { buildAppUrl } from '@/lib/appUrl'
import { useAuthStore } from '@/store/authStore'

export default function BillingSuccessPage() {
  const [searchParams] = useSearchParams()
  const hasHydrated = useAuthStore(s => s.hasHydrated)
  const token = useAuthStore(s => s.token)
  const setAuth = useAuthStore(s => s.setAuth)
  const refreshUser = useAuthStore(s => s.refreshUser)

  const redirectToPostPaymentPage = currentToken => {
    const target = currentToken
      ? buildAppUrl('/dashboard?upgraded=true')
      : buildAppUrl('/login?upgraded=true')
    window.location.assign(target)
  }

  useEffect(() => {
    if (!hasHydrated) return

    const sessionId = searchParams.get('session_id')
    if (!sessionId) {
      toast.success('Pagamento processado. Redirecionando...')
      redirectToPostPaymentPage(token)
      return
    }

    let canceled = false
    let activeToken = token

    if (!activeToken) {
      try {
        const stored = localStorage.getItem('rs-auth')
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed?.state?.token) {
            activeToken = parsed.state.token
            setAuth(parsed.state.token, parsed.state.user || null)
          }
        }
      } catch {}
    }

    api.get(`/billing/confirm-session?session_id=${encodeURIComponent(sessionId)}`)
      .then(async ({ data }) => {
        if (canceled) return
        if (activeToken) {
          await refreshUser()
          if (canceled) return
          toast.success('Assinatura ativada com sucesso.')
          redirectToPostPaymentPage(activeToken)
          return
        }

        toast.success('Pagamento confirmado. Redirecionando...')
        redirectToPostPaymentPage(activeToken)
      })
      .catch(err => {
        if (canceled) return
        toast.success('Pagamento recebido. Finalizando seu acesso...')
        redirectToPostPaymentPage(activeToken)
      })

    return () => {
      canceled = true
    }
  }, [hasHydrated, refreshUser, searchParams, setAuth, token])

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center px-4 overflow-hidden">
      <div className="relative max-w-md w-full">
        <div className="glow-orbit top-4 left-10 w-36 h-36 bg-green-400/20" />
        <div className="glow-orbit right-0 bottom-6 w-40 h-40 bg-brand-500/18" />
        <div className="card surface-3d tilt-card success-aura p-7 sm:p-8 text-center">
          <div className="relative z-10 flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-green-600/15 border border-green-500/30 flex items-center justify-center shadow-[0_18px_38px_rgba(34,197,94,0.22)]">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
          </div>
          <div className="relative z-10 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-900/35 border border-brand-700/30 text-brand-300 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Finalizando ativação
          </div>
          <h1 className="text-xl font-bold text-[color:var(--tp)] mb-2">Confirmando sua assinatura</h1>
          <p className="text-ink-400 text-sm">
          Estamos validando o checkout com a Stripe e liberando seu plano.
          </p>
        </div>
      </div>
    </div>
  )
}

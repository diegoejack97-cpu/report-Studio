import { useEffect } from 'react'
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
    <div className="min-h-screen bg-surface-0 flex items-center justify-center px-4">
      <div className="card p-6 max-w-md text-center">
        <h1 className="text-xl font-bold text-white mb-2">Confirmando sua assinatura</h1>
        <p className="text-ink-400 text-sm">
          Estamos validando o checkout com a Stripe e liberando seu plano.
        </p>
      </div>
    </div>
  )
}

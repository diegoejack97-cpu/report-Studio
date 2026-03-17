import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '@/lib/api'

export default function BillingSuccessPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    if (!sessionId) {
      toast.error('Sessão de checkout não encontrada.')
      navigate('/pricing', { replace: true })
      return
    }

    let canceled = false
    api.get(`/billing/confirm-session?session_id=${encodeURIComponent(sessionId)}`)
      .then(() => {
        if (canceled) return
        toast.success('Assinatura ativada com sucesso.')
        navigate('/dashboard', { replace: true })
      })
      .catch(err => {
        if (canceled) return
        toast.error(err?.response?.data?.detail || 'Não foi possível confirmar a assinatura.')
        navigate('/pricing', { replace: true })
      })

    return () => {
      canceled = true
    }
  }, [navigate, searchParams])

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

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { CreditCard, LoaderCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'

const stripePromiseCache = new Map()

function getStripePromise(publishableKey) {
  if (!publishableKey) return null
  if (!stripePromiseCache.has(publishableKey)) {
    stripePromiseCache.set(publishableKey, loadStripe(publishableKey))
  }
  return stripePromiseCache.get(publishableKey)
}

function EmbeddedCheckoutForm({ clientSecret, returnUrl, planName, onClose }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async event => {
    event.preventDefault()
    if (!stripe || !elements || submitting) return

    setSubmitting(true)
    const { error, paymentIntent } = await stripe.confirmPayment({
      clientSecret,
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    })

    if (error) {
      toast.error(error.message || 'Erro ao confirmar pagamento')
      setSubmitting(false)
      return
    }

    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      window.location.assign(returnUrl)
      return
    }

    toast('Continue a autenticação para concluir a assinatura')
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-surface-2 p-4">
        <div className="flex items-center gap-2 mb-3 text-ink-300">
          <CreditCard className="w-4 h-4" />
          <span className="text-sm font-medium">Pagamento do plano {planName}</span>
        </div>
        <PaymentElement />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="flex-1 py-2.5 rounded-xl border border-white/10 text-ink-300 hover:text-white hover:border-white/20 transition-all disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!stripe || !elements || submitting}
          className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold transition-all disabled:opacity-40"
        >
          {submitting ? 'Confirmando...' : 'Assinar agora'}
        </button>
      </div>
    </form>
  )
}

export default function EmbeddedCheckoutModal({
  open,
  onOpenChange,
  sessionData,
  loading,
  embedded,
  guestEmail,
  setGuestEmail,
  onStart,
  planName,
}) {
  const stripePromise = getStripePromise(sessionData?.publishable_key)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#040811]/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-white/10 bg-gradient-to-b from-surface-1 to-surface-2 p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <Dialog.Title className="text-xl font-bold text-white">
                Finalizar assinatura
              </Dialog.Title>
              <Dialog.Description className="text-sm text-ink-400 mt-1">
                {embedded
                  ? `Pagamento incorporado com Stripe para o plano ${planName}.`
                  : `Vamos redirecionar você para o checkout seguro da Stripe no plano ${planName}.`}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-2 text-ink-500 hover:text-white hover:bg-white/5 transition-all">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {!sessionData && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-white/10 bg-surface-2 p-4">
                <p className="text-sm text-ink-300">
                  {embedded
                    ? 'O pagamento acontece aqui na tela. A chave secreta continua protegida no backend.'
                    : 'Seu email será usado para abrir o checkout seguro sem expor credenciais no navegador.'}
                </p>
              </div>

              {setGuestEmail && (
                <div>
                  <label className="text-xs text-ink-400 font-medium block mb-1.5">Email para recibo e assinatura</label>
                  <input
                    type="email"
                    className="input-field"
                    value={guestEmail}
                    onChange={event => setGuestEmail(event.target.value)}
                    placeholder="voce@empresa.com"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={onStart}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold transition-all disabled:opacity-40"
              >
                {loading ? 'Preparando pagamento...' : embedded ? 'Continuar' : 'Ir para pagamento'}
              </button>
            </div>
          )}

          {loading && sessionData && (
            <div className="flex items-center justify-center gap-2 py-8 text-ink-300">
              <LoaderCircle className="w-4 h-4 animate-spin" />
              <span>Carregando formulário seguro...</span>
            </div>
          )}

          {!loading && sessionData && stripePromise && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: sessionData.client_secret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: '#2563eb',
                    colorBackground: '#112233',
                    colorText: '#d9e2ec',
                    colorDanger: '#f87171',
                    borderRadius: '14px',
                  },
                },
              }}
            >
              <EmbeddedCheckoutForm
                clientSecret={sessionData.client_secret}
                returnUrl={sessionData.return_url}
                planName={planName}
                onClose={() => onOpenChange(false)}
              />
            </Elements>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

import { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Building2, Mail, MessageSquare, User } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import api from '@/lib/api'

const INITIAL_FORM = {
  name: '',
  email: '',
  company: '',
  message: '',
  website: '',
}

export default function ContactPage() {
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const handleChange = event => {
    const { name, value } = event.target
    setFormData(current => ({ ...current, [name]: value }))
  }

  const handleSubmit = async event => {
    event.preventDefault()
    setSuccessMessage('')
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const { data } = await api.post('/contact', formData)
      setFormData(INITIAL_FORM)
      setSuccessMessage(data?.message || 'Mensagem enviada com sucesso! Entraremos em contato em breve.')
    } catch (error) {
      setErrorMessage(error?.response?.data?.detail || 'Não foi possível enviar sua mensagem. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-0 overflow-x-hidden">
      <Navbar />

      <section className="relative px-4 pt-24 pb-20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/2 top-10 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-brand-900/20 blur-[120px]" />
        </div>

        <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-6"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-700/30 bg-brand-900/30 px-3 py-1 text-xs font-semibold text-brand-300">
              Atendimento comercial
            </div>
            <h1 className="mb-5 text-4xl font-bold text-white md:text-5xl">
              Vamos montar a melhor proposta para sua operação
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-ink-400">
              Conte um pouco sobre o seu contexto, volume e equipe. Nosso time comercial retorna com uma proposta sob medida.
            </p>

            <div className="mt-10 space-y-4">
              {[
                {
                  icon: <Building2 className="h-5 w-5 text-brand-400" />,
                  title: 'Planos sob medida',
                  description: 'Modelos comerciais adaptados para equipes, múltiplos usuários e maior volume operacional.',
                },
                {
                  icon: <MessageSquare className="h-5 w-5 text-brand-400" />,
                  title: 'Resposta rápida',
                  description: 'Sua mensagem chega direto no canal comercial com reply-to configurado para responder ao cliente.',
                },
                {
                  icon: <Mail className="h-5 w-5 text-brand-400" />,
                  title: 'Contato centralizado',
                  description: 'Leads enviados pelo formulário ficam concentrados no email comercial definido para o projeto.',
                },
              ].map(item => (
                <div key={item.title} className="card flex items-start gap-4 p-5">
                  <div className="rounded-xl border border-brand-700/30 bg-brand-900/20 p-3">
                    {item.icon}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">{item.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-ink-500">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="card rounded-3xl p-6 md:p-8"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">Fale com vendas</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                Preencha os dados abaixo e envie sua mensagem para o nosso time comercial.
              </p>
            </div>

            {successMessage && (
              <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {successMessage}
              </div>
            )}

            {errorMessage && (
              <div className="mb-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-300">
                  <User className="h-4 w-4" />
                  Nome
                </span>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Seu nome"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-300">
                  <Mail className="h-4 w-4" />
                  Email
                </span>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="voce@empresa.com"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-300">
                  <Building2 className="h-4 w-4" />
                  Empresa
                </span>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Nome da empresa"
                />
              </label>

              <div className="hidden" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  type="text"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-300">
                  <MessageSquare className="h-4 w-4" />
                  Mensagem
                </span>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  className="input-field min-h-36 resize-y"
                  placeholder="Descreva sua necessidade, volume esperado e contexto da equipe."
                  minLength={10}
                  required
                />
              </label>

              <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center text-base">
                <span>{isSubmitting ? 'Enviando...' : 'Enviar mensagem'}</span>
                {!isSubmitting && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

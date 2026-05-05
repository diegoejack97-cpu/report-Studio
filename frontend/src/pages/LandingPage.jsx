import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { BarChart3, Zap, Shield, Download, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'

const FEATURES = [
  { icon: <BarChart3 className="w-5 h-5" />, title: 'Gráficos interativos', desc: 'Recharts com animações suaves. Donut, barras, linhas, Top N — todos configuráveis.' },
  { icon: <Zap className="w-5 h-5" />, title: 'Upload instantâneo', desc: 'XLSX, XLS, CSV. Detecção automática de colunas numéricas, datas e categorias.' },
  { icon: <Download className="w-5 h-5" />, title: 'Exportação HTML', desc: 'Relatório completo em arquivo único. Compartilhe sem depender de nenhuma plataforma.' },
  { icon: <Shield className="w-5 h-5" />, title: 'Seus dados, seu controle', desc: 'Dados processados no browser. Nenhum arquivo sobe para o servidor.' },
]

const PREVIEW_PLANS = [
  { name: 'Free', price: 'R$ 0', limit: '3 relatórios/mês', color: 'from-ink-700 to-ink-800' },
  { name: 'Individual Pro', price: 'R$ 29', limit: '30 relatórios/mês', color: 'from-brand-700 to-brand-900', highlight: true },
  { name: 'Empresarial Team', price: 'R$ 169', limit: '5 usuários inclusos', color: 'from-ink-700 to-ink-800' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-0 overflow-x-hidden">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-28 pb-24 px-4 text-center overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-brand-900/20 blur-[120px]" />
          <div className="glow-orbit top-16 left-[18%] w-36 h-36 bg-cyan-500/20" />
          <div className="glow-orbit right-[14%] top-24 w-48 h-48 bg-brand-500/20" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-900/40 border border-brand-700/40 text-brand-300 text-xs font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
            Transforme Excel em relatórios profissionais
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.08]">
            <span className="text-white">Relatórios</span>{' '}
            <span className="gradient-text">que impressionam</span>
            <br />
            <span className="text-white">em minutos</span>
          </h1>

          <p className="text-ink-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Upload do seu XLSX ou CSV, configure gráficos interativos, KPIs e salving banner —
            exporte HTML profissional com um clique.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link to="/register" className="btn-primary px-8 py-3 text-base flex items-center gap-2 group">
              Criar conta grátis
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/pricing" className="btn-outline px-8 py-3 text-base">
              Ver planos
            </Link>
          </div>

          <p className="text-ink-600 text-sm mt-4">3 relatórios grátis · sem cartão</p>
        </motion.div>

        {/* Browser mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="hero-stage relative mt-16 max-w-5xl mx-auto"
        >
          <div className="hero-shell">
            {/* Browser chrome */}
            <div className="hero-float flex items-center gap-2 px-4 py-3 bg-surface-3 border-b border-white/[0.06]">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-amber-500/70" />
              <div className="w-3 h-3 rounded-full bg-green-500/70" />
              <div className="flex-1 mx-4 py-1 px-3 rounded bg-surface-1 text-ink-600 text-xs text-center">
                reportflow.app/editor
              </div>
            </div>
            {/* App screenshot placeholder */}
            <div className="aspect-[16/9] bg-gradient-to-br from-surface-1 via-surface-2 to-surface-3 flex items-center justify-center">
              <div className="hero-float text-center">
                <div className="flex justify-center mb-3"><Sparkles className="w-12 h-12 text-brand-400" /></div>
                <p className="text-ink-300 text-sm font-medium">Editor de relatórios</p>
                <p className="text-ink-500 text-xs mt-1">Upload, KPIs, gráficos e export em uma só superfície</p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-24 px-4 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Tudo que você precisa</h2>
          <p className="text-ink-400 max-w-xl mx-auto">Sem aprender ferramentas complexas. Dados entram, relatório sai.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="card surface-3d tilt-card p-6 hover:border-brand-800/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-brand-900/40 border border-brand-800/40 flex items-center justify-center text-brand-400 mb-4 group-hover:bg-brand-800/40 transition-colors">
                {f.icon}
              </div>
              <h3 className="text-white font-semibold mb-2">{f.title}</h3>
              <p className="text-ink-500 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pricing preview */}
      <section className="py-24 px-4 bg-surface-1/40 border-y border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-white mb-3">Planos simples</h2>
            <p className="text-ink-400">Comece grátis. Escale quando precisar.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PREVIEW_PLANS.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative surface-3d tilt-card rounded-2xl p-6 border ${p.highlight ? 'border-brand-600 bg-gradient-to-br from-brand-950 to-surface-2' : 'border-white/[0.08] bg-surface-2'}`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 badge bg-brand-600 text-white">
                    Mais popular
                  </div>
                )}
                <div className="text-ink-400 text-sm font-medium mb-1">{p.name}</div>
                <div className="text-3xl font-bold text-white mb-1">{p.price}<span className="text-ink-500 text-sm font-normal">/mês</span></div>
                <div className="text-ink-400 text-sm mb-4">{p.limit}</div>
                <Link
                  to={i === 0 ? '/register' : '/pricing'}
                  className={`block text-center py-2 px-4 rounded-lg text-sm font-semibold transition-all ${p.highlight ? 'bg-brand-600 hover:bg-brand-500 text-white' : 'border border-white/10 hover:border-white/20 text-ink-200'}`}
                >
                  {i === 0 ? 'Começar grátis' : 'Ver plano'}
                </Link>
              </motion.div>
            ))}
          </div>

          <p className="text-center text-ink-600 text-sm mt-6">
            <Link to="/pricing" className="text-brand-400 hover:text-brand-300">Ver comparação completa →</Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 text-center text-ink-600 text-sm">
        <div className="flex items-center justify-center gap-1 mb-2">
          <Sparkles className="w-4 h-4 text-brand-400" />
          <span className="font-semibold text-ink-300">Report Flow</span>
        </div>
        <p>© {new Date().getFullYear()} · Relatórios profissionais para equipes de procurement</p>
      </footer>
    </div>
  )
}

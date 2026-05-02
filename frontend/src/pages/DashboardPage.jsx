import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, Trash2, Edit3, Download, ArrowUpRight, Crown, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import Navbar from '@/components/layout/Navbar'

const PLAN_COLORS = { free: '#64748b', starter: '#3b82f6', pro: '#8b5cf6', business: '#f59e0b' }
const PLAN_LABELS = { free: 'Gratuito', starter: 'Individual Lite', pro: 'Individual Pro', business: 'Individual Plus' }

export default function DashboardPage() {
  const { user, refreshUser } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()

  useEffect(() => {
    refreshUser()
    if (params.get('upgraded')) {
      toast.success('Plano atualizado com sucesso!')
    }
    if (params.get('exported')) {
      toast.success('HTML exportado e contabilizado no seu plano.')
    }
  }, [])

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: () => api.get('/reports/').then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: id => api.delete(`/reports/${id}`),
    onSuccess: () => { qc.invalidateQueries(['reports']); toast.success('Relatório excluído') },
    onError: () => toast.error('Erro ao excluir'),
  })

  const usagePercent = user ? Math.round((user.reports_this_month / user.plan_limit) * 100) : 0
  const usageData = [{ value: usagePercent, fill: PLAN_COLORS[user?.plan] || '#3b82f6' }]

  const handleNewReport = () => navigate('/editor')

  return (
    <div className="min-h-screen bg-surface-0">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 pt-20 pb-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-2xl font-bold text-white">
              Olá, {user?.full_name?.split(' ')[0] || 'bem-vindo'}
            </h1>
            <p className="text-ink-500 text-sm mt-0.5">{reports.length} relatório{reports.length !== 1 ? 's' : ''} salvo{reports.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={handleNewReport} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo relatório
          </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Usage + Plan card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="card p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-ink-300">Seu plano</h3>
              <span className="badge bg-brand-900/50 border border-brand-700/40 text-brand-300 capitalize">
                {PLAN_LABELS[user?.plan] || '—'}
              </span>
            </div>

            {/* Radial usage - SVG simples */}
            <div className="h-32 relative flex items-center justify-center">
              {(() => {
                const used = user?.reports_this_month || 0
                const limit = user?.plan_limit === 9999 ? 0 : (user?.plan_limit || 1)
                const pct = limit === 0 ? 0 : Math.min(used / limit, 1)
                const r = 48, cx = 64, cy = 64
                const circ = 2 * Math.PI * r
                const dash = pct * circ
                return (
                  <svg width="128" height="128" viewBox="0 0 128 128">
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1c3350" strokeWidth="10" />
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2563eb" strokeWidth="10"
                      strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                      transform={`rotate(-90 ${cx} ${cy})`} />
                    <text x={cx} y={cy - 6} textAnchor="middle" fill="#d9e2ec" fontSize="20" fontWeight="bold">{used}</text>
                    <text x={cx} y={cy + 14} textAnchor="middle" fill="#486581" fontSize="11">/ {user?.plan_limit === 9999 ? '∞' : user?.plan_limit}</text>
                  </svg>
                )
              })()}
            </div>

            <p className="text-center text-xs text-ink-500 mb-4">relatórios este mês</p>

            <Link to={user?.plan === 'free' ? '/pricing' : '/billing'} className="block w-full text-center py-2 px-3 rounded-lg bg-brand-900/40 border border-brand-700/40 text-brand-300 text-xs font-semibold hover:bg-brand-800/40 transition-colors">
              <Crown className="w-3 h-3 inline mr-1" />
              {user?.plan === 'free' ? 'Fazer upgrade' : 'Gerenciar upgrade ou downgrade'}
            </Link>
          </motion.div>

          {/* Reports grid */}
          <div className="lg:col-span-3">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="card p-5 h-36 animate-pulse bg-surface-2" />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="card p-12 text-center"
              >
                <div className="flex justify-center mb-3"><FileText className="w-10 h-10 text-ink-500" /></div>
                <h3 className="text-white font-semibold mb-2">Nenhum relatório ainda</h3>
                <p className="text-ink-500 text-sm mb-4">Faça upload de um Excel ou CSV para começar</p>
                <button onClick={handleNewReport} className="btn-primary mx-auto">
                  <Plus className="w-4 h-4 inline mr-1" /> Criar primeiro relatório
                </button>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {reports.map((r, i) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="card p-5 hover:border-white/[0.12] transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-900/40 border border-brand-800/30 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-brand-400" />
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link to={`/editor/${r.id}`} className="p-1.5 rounded hover:bg-white/5 text-ink-400 hover:text-white">
                          <Edit3 className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => confirm('Excluir relatório?') && deleteMutation.mutate(r.id)}
                          className="p-1.5 rounded hover:bg-red-900/30 text-ink-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-sm font-semibold text-white mb-0.5 truncate">{r.title}</h3>
                    <p className="text-ink-500 text-xs">{r.row_count.toLocaleString('pt-BR')} linhas · {r.col_count} colunas</p>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
                      <span className="text-xs text-ink-600">
                        {new Date(r.updated_at).toLocaleDateString('pt-BR')}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-ink-500">
                        <Download className="w-3 h-3" /> {r.export_count}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

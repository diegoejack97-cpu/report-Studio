import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronRight, ChevronLeft, Check, X, Sparkles, BarChart2, PieChart, TrendingUp, Trophy, Tag, DollarSign, Calendar, Hash, Layers } from 'lucide-react'

// ── Utilitários de detecção ────────────────────────────────────────
function detectColumns(cols, rows) {
  return cols.map((name, i) => {
    const vals = rows.map(r => r[i]).filter(v => v !== '' && v != null)
    const total = vals.length
    if (total === 0) return { name, i, type: 'text', uniq: 0, sample: [] }

    const numOk  = vals.filter(v => !isNaN(parseFloat(String(v).replace(/[R$.,\s]/g, '').replace(',', '.')))).length
    const dateOk = vals.filter(v => /\d{1,4}[\/\-]\d{1,2}/.test(String(v))).length
    const uniq   = new Set(vals.map(v => String(v).trim())).size

    let type = 'text'
    if (dateOk > total * 0.5) type = 'date'
    else if (numOk > total * 0.6) type = 'number'

    const sample = [...new Set(vals.slice(0, 20).map(v => String(v).trim()))].slice(0, 5)
    const sum = type === 'number'
      ? vals.reduce((s, v) => s + (parseFloat(String(v).replace(/[R$\s.]/g, '').replace(',', '.')) || 0), 0)
      : 0

    return { name, i, type, uniq, sample, sum, pct: numOk / total }
  })
}

function autoDetectSaving(analyzed) {
  const nums = analyzed.filter(c => c.type === 'number')
  // Heurística: par de colunas com "corrig/original/bruto" e "negoc/final/pago"
  const keywords1 = ['corrig', 'original', 'estimado', 'bruto', 'inicial', 'valor1', 'v1']
  const keywords2 = ['negoc', 'final', 'pago', 'contrato', 'ajust', 'valor2', 'v2']
  const savKw    = ['saving', 'economia', 'reducao', 'desconto', 'ganho']

  const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const v1 = nums.find(c => keywords1.some(k => normalize(c.name).includes(k)))
  const v2 = nums.find(c => keywords2.some(k => normalize(c.name).includes(k)))
  const sv = nums.find(c => savKw.some(k => normalize(c.name).includes(k)))

  return { v1: v1?.i ?? '', v2: v2?.i ?? '', savingCol: sv?.i ?? '' }
}

function autoDetectCharts(analyzed) {
  const cats  = analyzed.filter(c => c.type === 'text' && c.uniq >= 2 && c.uniq <= 30)
  const nums  = analyzed.filter(c => c.type === 'number')
  const dates = analyzed.filter(c => c.type === 'date')

  // Heurística: coluna com menos categorias = melhor para distribuição
  const catSorted = [...cats].sort((a, b) => a.uniq - b.uniq)

  return {
    g1Cat: catSorted[0]?.i ?? '',
    g2Cat: catSorted[1]?.i ?? catSorted[0]?.i ?? '',
    g3Date: dates[0]?.i ?? '',
    g3V1: nums[0]?.i ?? '',
    g3V2: nums[1]?.i ?? '',
    g4Label: cats.find(c => /fornec|parceiro|empresa|vendor|supplier/i.test(c.name))?.i ?? catSorted[catSorted.length - 1]?.i ?? '',
    g4Val: nums.find(c => /saving|economia|valor|total/i.test(c.name))?.i ?? nums[0]?.i ?? '',
  }
}

// ── Componentes base ──────────────────────────────────────────────
function ModalBackdrop({ children, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(6,14,25,0.88)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      {children}
    </motion.div>
  )
}

function WizardCard({ children, wide }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.93, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={`relative bg-[#0b1828] border border-white/[0.12] rounded-2xl shadow-2xl overflow-hidden ${wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'}`}
    >
      {children}
    </motion.div>
  )
}

function ProgressBar({ current, total }) {
  return (
    <div className="px-6 pt-5 pb-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Configuração do relatório</span>
        <span className="text-[10px] text-slate-500">{current} de {total}</span>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(current / total) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  )
}

function StepTitle({ emoji, title, desc }) {
  return (
    <div className="px-6 pt-4 pb-2">
      <div className="text-2xl mb-2">{emoji}</div>
      <h2 className="text-lg font-bold text-white mb-1">{title}</h2>
      <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
    </div>
  )
}

function ColButton({ col, selected, onClick, showType = true }) {
  const typeIcon = col.type === 'date' ? '📅' : col.type === 'number' ? '💰' : '🏷'
  const typeColor = col.type === 'date' ? 'text-amber-400' : col.type === 'number' ? 'text-green-400' : 'text-blue-400'
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all flex items-center gap-3 ${
        selected
          ? 'bg-blue-600/20 border-blue-500/60 text-white'
          : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.07] hover:border-white/[0.15]'
      }`}
    >
      {selected ? (
        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Check className="w-3 h-3 text-white" />
        </div>
      ) : (
        <div className="w-5 h-5 rounded-full border border-white/20 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{col.name}</div>
        {showType && col.sample?.length > 0 && (
          <div className="text-[10px] text-slate-500 truncate mt-0.5">{col.sample.slice(0,3).join(', ')}</div>
        )}
      </div>
      {showType && <span className={`text-[10px] font-bold ${typeColor} flex-shrink-0`}>{typeIcon}</span>}
    </button>
  )
}

function ColSelect({ label, value, onChange, cols, filter, placeholder = '— selecionar —', hint }) {
  const options = filter ? cols.filter(filter) : cols
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-blue-500 transition-colors"
      >
        <option value="">{placeholder}</option>
        {options.map(c => <option key={c.i} value={String(c.i)}>{c.name}</option>)}
      </select>
      {hint && <p className="text-[10px] text-slate-600 mt-1">{hint}</p>}
    </div>
  )
}

function NavButtons({ onBack, onNext, nextLabel = 'Próximo', nextDisabled, onSkip, isLast }) {
  return (
    <div className="flex items-center gap-3 px-6 pb-6 pt-2">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-slate-300 text-sm font-semibold hover:bg-white/[0.08] transition-all">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
      )}
      {onSkip && (
        <button onClick={onSkip} className="px-4 py-2 rounded-lg text-slate-500 text-sm font-semibold hover:text-slate-300 transition-colors ml-auto">
          Pular
        </button>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold transition-all ${onSkip ? '' : 'ml-auto'} ${
          nextDisabled
            ? 'bg-white/[0.05] text-slate-600 cursor-not-allowed'
            : isLast
              ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-900/40 hover:shadow-blue-900/60'
              : 'bg-blue-600 text-white hover:bg-blue-500'
        }`}
      >
        {isLast ? <><Sparkles className="w-4 h-4" /> Gerar relatório!</> : <>{nextLabel} <ChevronRight className="w-4 h-4" /></>}
      </button>
    </div>
  )
}

// ── STEPS ─────────────────────────────────────────────────────────

// Step 1: Identificação do relatório
function StepIdentity({ data, analyzed, onChange, onNext, onSkip }) {
  const [title, setTitle]   = useState(data.title   || '')
  const [company, setCompany] = useState(data.company || '')
  const [period, setPeriod] = useState(data.period  || '')

  const next = () => {
    onChange({ title: title || 'Novo Relatório', company, period })
    onNext()
  }

  return (
    <>
      <StepTitle emoji="📋" title="Sobre este relatório" desc={`Identifiquei ${analyzed.length} colunas e careguei os seus dados. Vamos configurar o relatório em poucos passos.`} />
      <div className="px-6 pb-2 space-y-3">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Título do relatório</label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Contratos Procurement 2025"
            className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Empresa / Área</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Ex: Acme Corp" className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Período</label>
            <input value={period} onChange={e => setPeriod(e.target.value)} placeholder="Ex: Q1 2025" className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors" />
          </div>
        </div>

        {/* Preview colunas detectadas */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-3 mt-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Colunas detectadas automaticamente</div>
          <div className="flex flex-wrap gap-1.5">
            {analyzed.map(c => (
              <span key={c.i} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                c.type === 'date'   ? 'bg-amber-900/30 border-amber-700/40 text-amber-400' :
                c.type === 'number' ? 'bg-green-900/30 border-green-700/40 text-green-400' :
                                      'bg-blue-900/30 border-blue-700/40 text-blue-400'
              }`}>
                {c.type === 'date' ? '📅' : c.type === 'number' ? '💰' : '🏷'} {c.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <NavButtons onNext={next} nextLabel="Próximo" />
    </>
  )
}

// Step 2: Saving Banner
function StepSaving({ data, analyzed, onChange, onNext, onBack, onSkip }) {
  const nums  = analyzed.filter(c => c.type === 'number')
  const auto  = autoDetectSaving(analyzed)

  const [enabled, setEnabled]    = useState(data.savingEnabled !== false)
  const [v1Col, setV1]           = useState(data.v1Col   ?? String(auto.v1))
  const [v2Col, setV2]           = useState(data.v2Col   ?? String(auto.v2))
  const [savCol, setSav]         = useState(data.savingCol ?? String(auto.savingCol))
  const [label, setLabel]        = useState(data.label   || 'Saving Total')

  const pnum = v => parseFloat(String(v ?? '').replace(/[R$.\s]/g, '').replace(',', '.')) || 0
  const fmtBRL = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  const v1Sum = analyzed[parseInt(v1Col)]?.sum ?? 0
  const v2Sum = analyzed[parseInt(v2Col)]?.sum ?? 0
  const svSum = analyzed[parseInt(savCol)]?.sum ?? 0
  const saving = savCol !== '' ? svSum : (v1Col !== '' && v2Col !== '' ? v1Sum - v2Sum : 0)

  const next = () => {
    onChange({ savingEnabled: enabled, label, v1Col, v2Col, savingCol: savCol })
    onNext()
  }

  return (
    <>
      <StepTitle emoji="💰" title="Banner de Saving" desc="O saving é o destaque principal do seu relatório. Configure as colunas para o cálculo automático." />
      <div className="px-6 pb-2 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.12]">
          <div className={`w-10 h-5 rounded-full relative transition-colors ${enabled ? 'bg-blue-600' : 'bg-white/10'}`} onClick={() => setEnabled(e => !e)}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm font-semibold text-slate-200">Mostrar banner de saving</span>
        </label>

        {enabled && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Rótulo do saving</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex: Saving Total" className="w-full px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ColSelect label="Valor Original" value={v1Col} onChange={setV1} cols={nums} hint="Ex: Valor Corrigido" />
              <ColSelect label="Valor Negociado" value={v2Col} onChange={setV2} cols={nums} hint="Ex: Valor Negociado" />
              <ColSelect label="Saving direto" value={savCol} onChange={setSav} cols={nums} hint="Ou deixe vazio" />
            </div>

            {saving !== 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gradient-to-r from-[#1a3a5c] to-[#2e5c8a] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-white/60 uppercase tracking-wider mb-1">{label}</div>
                  <div className="text-2xl font-bold text-green-400 font-mono">{fmtBRL(saving)}</div>
                  {v1Col !== '' && v2Col !== '' && savCol === '' && (
                    <div className="flex items-center gap-3 mt-2">
                      <div><div className="text-xs font-bold font-mono text-white">{fmtBRL(v1Sum)}</div><div className="text-[9px] text-white/50">{analyzed[parseInt(v1Col)]?.name}</div></div>
                      <span className="text-white/30 text-sm">→</span>
                      <div><div className="text-xs font-bold font-mono text-green-400">{fmtBRL(v2Sum)}</div><div className="text-[9px] text-white/50">{analyzed[parseInt(v2Col)]?.name}</div></div>
                    </div>
                  )}
                </div>
                <div className="text-4xl opacity-10">💹</div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
      <NavButtons onBack={onBack} onNext={next} onSkip={onSkip} />
    </>
  )
}

// Step 3: KPIs
function StepKPIs({ data, analyzed, onChange, onNext, onBack, onSkip }) {
  const ICONS = ['📊','💰','📋','🏆','📈','🏢','⚡','🎯','✅','📌']
  const FMTS  = [
    { value: 'count', label: 'Total registros' },
    { value: 'sum',   label: 'Soma Σ' },
    { value: 'avg',   label: 'Média' },
    { value: 'max',   label: 'Máximo' },
    { value: 'topval',label: 'Mais frequente' },
    { value: 'countuniq', label: 'Valores únicos' },
  ]

  const [kpis, setKpis] = useState(data.kpis?.length ? data.kpis : [
    { label: 'Total Registros', icon: '📋', col: '', fmt: 'count', color: '#3b82f6' },
    { label: 'Valor Total', icon: '💰', col: String(analyzed.filter(c => c.type === 'number')[0]?.i ?? ''), fmt: 'sum', color: '#16a34a' },
    { label: 'Top Categoria', icon: '🏆', col: String(analyzed.filter(c => c.type === 'text' && c.uniq >= 2)[0]?.i ?? ''), fmt: 'topval', color: '#f59e0b' },
  ])

  const addKpi = () => setKpis(k => [...k, { label: 'Novo KPI', icon: '📊', col: '', fmt: 'count', color: '#8b5cf6' }])
  const remKpi = i => setKpis(k => k.filter((_, j) => j !== i))
  const updKpi = (i, patch) => setKpis(k => k.map((kpi, j) => j === i ? { ...kpi, ...patch } : kpi))

  const next = () => { onChange({ kpis }); onNext() }

  return (
    <>
      <StepTitle emoji="📊" title="KPIs do relatório" desc="Escolha os indicadores que aparecerão em destaque no topo do relatório." />
      <div className="px-6 pb-2 space-y-2 max-h-[340px] overflow-y-auto">
        {kpis.map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <select value={kpi.icon} onChange={e => updKpi(i, { icon: e.target.value })} className="w-12 h-8 bg-white/[0.06] border border-white/[0.1] rounded-lg text-base text-center outline-none">
                {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
              </select>
              <input value={kpi.label} onChange={e => updKpi(i, { label: e.target.value })} placeholder="Rótulo" className="flex-1 px-2.5 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-blue-500 transition-colors" />
              <input type="color" value={kpi.color || '#3b82f6'} onChange={e => updKpi(i, { color: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
              <button onClick={() => remKpi(i)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-red-900/30 hover:text-red-400 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-slate-500 font-bold uppercase block mb-1">Coluna</label>
                <select value={kpi.col ?? ''} onChange={e => updKpi(i, { col: e.target.value })} className="w-full px-2 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-xs text-white outline-none focus:border-blue-500">
                  <option value="">— total registros —</option>
                  {analyzed.map(c => <option key={c.i} value={String(c.i)}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-slate-500 font-bold uppercase block mb-1">Cálculo</label>
                <select value={kpi.fmt || 'count'} onChange={e => updKpi(i, { fmt: e.target.value })} className="w-full px-2 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-xs text-white outline-none focus:border-blue-500">
                  {FMTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>
          </motion.div>
        ))}
        {kpis.length < 6 && (
          <button onClick={addKpi} className="w-full py-2.5 border border-dashed border-white/[0.12] rounded-xl text-slate-500 hover:text-slate-300 hover:border-white/25 text-sm transition-all">
            + Adicionar KPI
          </button>
        )}
      </div>
      <NavButtons onBack={onBack} onNext={next} onSkip={onSkip} />
    </>
  )
}

// Step 4: Gráfico de Distribuição (G1 + G2)
function StepChartsDist({ data, analyzed, onChange, onNext, onBack, onSkip }) {
  const cats = analyzed.filter(c => c.type === 'text' && c.uniq >= 2 && c.uniq <= 50)
  const auto = autoDetectCharts(analyzed)

  const [g1on, setG1on] = useState(true)
  const [g1col, setG1col] = useState(data.g1col ?? String(auto.g1Cat))
  const [g1type, setG1type] = useState(data.g1type || 'doughnut')
  const [g2on, setG2on] = useState(true)
  const [g2col, setG2col] = useState(data.g2col ?? String(auto.g2Cat))
  const [g2type, setG2type] = useState(data.g2type || 'bar')

  const next = () => {
    onChange({ g1on, g1col, g1type, g2on, g2col, g2type })
    onNext()
  }

  const CHART_TYPES = [
    { value: 'doughnut', label: '🍩 Donut' },
    { value: 'pie',      label: '🥧 Pizza' },
    { value: 'bar',      label: '📊 Barras verticais' },
    { value: 'hbar',     label: '📊 Barras horizontais' },
  ]
  const CHART_TYPES2 = [
    { value: 'bar',      label: '📊 Barras verticais' },
    { value: 'hbar',     label: '📊 Barras horizontais' },
    { value: 'doughnut', label: '🍩 Donut' },
    { value: 'line',     label: '📈 Linha' },
  ]

  return (
    <>
      <StepTitle emoji="🔵" title="Gráficos de distribuição" desc="Esses gráficos mostram como os dados se dividem por categoria. Escolha quais colunas usar." />
      <div className="px-6 pb-2 space-y-4">
        {/* G1 */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">Gráfico 1 — Distribuição</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className={`w-8 h-4 rounded-full relative transition-colors ${g1on ? 'bg-blue-600' : 'bg-white/10'}`} onClick={() => setG1on(v => !v)}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow ${g1on ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </label>
          </div>
          {g1on && (
            <div className="grid grid-cols-2 gap-3">
              <ColSelect label="Coluna de categoria" value={g1col} onChange={setG1col} cols={cats} hint={cats[0] ? `${cats[0].uniq} valores únicos` : ''} />
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Tipo de gráfico</label>
                <select value={g1type} onChange={e => setG1type(e.target.value)} className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-blue-500 transition-colors">
                  {CHART_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* G2 */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">Gráfico 2 — Por Categoria</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className={`w-8 h-4 rounded-full relative transition-colors ${g2on ? 'bg-blue-600' : 'bg-white/10'}`} onClick={() => setG2on(v => !v)}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow ${g2on ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </label>
          </div>
          {g2on && (
            <div className="grid grid-cols-2 gap-3">
              <ColSelect label="Coluna de categoria" value={g2col} onChange={setG2col} cols={cats} />
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Tipo de gráfico</label>
                <select value={g2type} onChange={e => setG2type(e.target.value)} className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-blue-500 transition-colors">
                  {CHART_TYPES2.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
      <NavButtons onBack={onBack} onNext={next} onSkip={onSkip} />
    </>
  )
}

// Step 5: Gráfico Temporal + Top N
function StepChartsAdvanced({ data, analyzed, onChange, onNext, onBack, onSkip }) {
  const nums  = analyzed.filter(c => c.type === 'number')
  const dates = analyzed.filter(c => c.type === 'date')
  const cats  = analyzed.filter(c => c.type === 'text' && c.uniq >= 2)
  const auto  = autoDetectCharts(analyzed)

  const [g3on, setG3on] = useState(dates.length > 0)
  const [g3date, setG3date] = useState(data.g3date ?? String(auto.g3Date))
  const [g3v1, setG3v1]   = useState(data.g3v1   ?? String(auto.g3V1))
  const [g3v2, setG3v2]   = useState(data.g3v2   ?? String(auto.g3V2))

  const [g4on, setG4on]     = useState(true)
  const [g4label, setG4label] = useState(data.g4label ?? String(auto.g4Label))
  const [g4val, setG4val]   = useState(data.g4val   ?? String(auto.g4Val))
  const [g4n, setG4n]       = useState(data.g4n    ?? 10)

  const next = () => {
    onChange({ g3on, g3date, g3v1, g3v2, g4on, g4label, g4val, g4n })
    onNext()
  }

  return (
    <>
      <StepTitle emoji="📈" title="Evolução e ranking" desc="Veja como os dados evoluem no tempo e quem são os principais por valor." />
      <div className="px-6 pb-2 space-y-4">
        {/* G3 Temporal */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-white">Evolução Temporal</span>
              {dates.length === 0 && <span className="ml-2 text-[10px] text-amber-400 bg-amber-900/20 border border-amber-700/30 px-2 py-0.5 rounded-full">nenhuma coluna de data detectada</span>}
            </div>
            <div className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${g3on ? 'bg-blue-600' : 'bg-white/10'}`} onClick={() => setG3on(v => !v)}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow ${g3on ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </div>
          {g3on && (
            <div className="grid grid-cols-3 gap-2">
              <ColSelect label="Coluna de DATA" value={g3date} onChange={setG3date} cols={[...dates, ...analyzed.filter(c => c.type === 'text' && /data|dt_|date|mes|ano/i.test(c.name))]} />
              <ColSelect label="Valor 1 (linha)" value={g3v1} onChange={setG3v1} cols={nums} />
              <ColSelect label="Valor 2 (linha)" value={g3v2} onChange={setG3v2} cols={nums} placeholder="— opcional —" />
            </div>
          )}
        </div>

        {/* G4 Top N */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">Top N por Valor</span>
            <div className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${g4on ? 'bg-blue-600' : 'bg-white/10'}`} onClick={() => setG4on(v => !v)}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow ${g4on ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </div>
          {g4on && (
            <div className="grid grid-cols-3 gap-2">
              <ColSelect label="Coluna de rótulo" value={g4label} onChange={setG4label} cols={cats} hint="Ex: Fornecedor" />
              <ColSelect label="Coluna de valor" value={g4val} onChange={setG4val} cols={nums} hint="Soma por grupo" />
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Top N</label>
                <select value={g4n} onChange={e => setG4n(parseInt(e.target.value))} className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-blue-500 transition-colors">
                  {[5, 8, 10, 15, 20].map(n => <option key={n} value={n}>Top {n}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
      <NavButtons onBack={onBack} onNext={next} onSkip={onSkip} isLast />
    </>
  )
}

// ── WIZARD PRINCIPAL ───────────────────────────────────────────────
const TOTAL_STEPS = 5

export default function SetupWizard({ rows, cols, onComplete, onDismiss }) {
  const [step, setStep]     = useState(1)
  const [wdata, setWdata]   = useState({})
  const analyzed            = detectColumns(cols, rows)

  const update = patch => setWdata(d => ({ ...d, ...patch }))
  const next   = ()    => setStep(s => s + 1)
  const back   = ()    => setStep(s => s - 1)
  const skip   = ()    => setStep(s => s + 1)

  const finish = () => {
    // Monta estado final do editor a partir das respostas do wizard
    const a = analyzed

    const ci = v => {
      const n = parseInt(v)
      return isNaN(n) || n < 0 || n >= cols.length ? '' : String(n)
    }

    const finalState = {
      title:   wdata.title   || 'Novo Relatório',
      subtitle: wdata.subtitle || '',
      period:  wdata.period  || '',
      company: wdata.company || '',
      footer:  'Relatório gerado pelo Report Studio · Uso interno',

      saving: {
        label:     wdata.label     || 'Saving Total',
        savingCol: ci(wdata.savingCol),
        v1Col:     ci(wdata.v1Col),
        v1Label:   wdata.v1Col !== '' ? (a[parseInt(wdata.v1Col)]?.name || 'Valor 1') : 'Valor Original',
        v2Col:     ci(wdata.v2Col),
        v2Label:   wdata.v2Col !== '' ? (a[parseInt(wdata.v2Col)]?.name || 'Valor 2') : 'Valor Negociado',
      },

      sections: {
        saving:  wdata.savingEnabled !== false,
        kpi:     (wdata.kpis || []).length > 0,
        charts:  true,
        summary: true,
        table:   true,
        filters: true,
        footer:  true,
      },

      kpis: wdata.kpis || [],

      charts: {
        g1: {
          on:    wdata.g1on !== false,
          title: wdata.g1col !== '' ? `Distribuição por ${a[parseInt(wdata.g1col)]?.name || ''}` : 'Distribuição',
          type:  wdata.g1type || 'doughnut',
          col:   ci(wdata.g1col),
          h: 260,
        },
        g2: {
          on:    wdata.g2on !== false,
          title: wdata.g2col !== '' ? `Contratos por ${a[parseInt(wdata.g2col)]?.name || ''}` : 'Por Categoria',
          type:  wdata.g2type || 'bar',
          col:   ci(wdata.g2col),
          h: 260,
        },
        g3: {
          on:      wdata.g3on !== false,
          title:   'Evolução Mensal',
          type:    'line',
          dateCol: ci(wdata.g3date),
          v1Col:   ci(wdata.g3v1),
          v2Col:   ci(wdata.g3v2),
          h: 300,
        },
        g4: {
          on:       wdata.g4on !== false,
          title:    wdata.g4label !== '' ? `Top ${wdata.g4n || 10} por ${a[parseInt(wdata.g4label)]?.name || ''}` : 'Top N por Valor',
          type:     'hbar',
          labelCol: ci(wdata.g4label),
          valCol:   ci(wdata.g4val),
          n:        wdata.g4n || 10,
          h: 400,
        },
      },

      groupCol: ci(wdata.g2col), // agrupamento do resumo = mesma col do G2
      colors: {
        primary:   '#1a3a5c',
        secondary: '#2e5c8a',
        accent:    '#4ade80',
        bg:        '#eef1f5',
        text:      '#1e293b',
      },
    }

    onComplete(finalState)
  }

  const stepProps = { analyzed, data: wdata, onChange: update }

  return (
    <AnimatePresence>
      <ModalBackdrop onClose={onDismiss}>
        <WizardCard wide={step >= 3}>
          <ProgressBar current={step} total={TOTAL_STEPS} />
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {step === 1 && <StepIdentity      {...stepProps} onNext={next} />}
              {step === 2 && <StepSaving        {...stepProps} onNext={next} onBack={back} onSkip={skip} />}
              {step === 3 && <StepKPIs          {...stepProps} onNext={next} onBack={back} onSkip={skip} />}
              {step === 4 && <StepChartsDist    {...stepProps} onNext={next} onBack={back} onSkip={skip} />}
              {step === 5 && <StepChartsAdvanced {...stepProps} onNext={finish} onBack={back} onSkip={finish} />}
            </motion.div>
          </AnimatePresence>
        </WizardCard>
      </ModalBackdrop>
    </AnimatePresence>
  )
}

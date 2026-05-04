import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronRight, ChevronLeft, X, Sparkles, DollarSign, BarChart3, TrendingUp, AlertTriangle, ClipboardList, CalendarDays, Tag } from 'lucide-react'

const METRIC_LABELS = {
  ECONOMIA: 'Economia',
  TOTAL: 'Total Financeiro',
  VARIACAO: 'Variação',
  TAXA: 'Taxa',
  VOLUME: 'Volume',
}

const METRIC_COLORS = {
  ECONOMIA: '#16A34A',
  TOTAL: '#2563EB',
  VARIACAO: '#F59E0B',
  TAXA: '#7C3AED',
  VOLUME: '#6B7280',
}

const DEFAULT_LABELS = new Set(Object.values(METRIC_LABELS))

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

function isNumericType(type) {
  return ['number', 'monetary', 'percent'].includes(type)
}

function getMetricDisplayMode(metricType) {
  if (metricType === 'TAXA' || metricType === 'VARIACAO') return 'percent'
  if (metricType === 'VOLUME') return 'number'
  return 'currency'
}

function formatMetricValue(metricType, value) {
  const mode = getMetricDisplayMode(metricType)
  const numeric = Number(value ?? 0)
  if (mode === 'percent') return `${numeric.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  if (mode === 'number') return numeric.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
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
  const steps = Array.from({ length: total }, (_, index) => index + 1)
  return (
    <div className="px-6 pt-5 pb-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Configuração do relatório</span>
        <span className="text-[11px] font-semibold text-slate-300">Etapa {current} de {total}</span>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(current / total) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {steps.map(step => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-colors ${
              step === current
                ? 'bg-cyan-400'
                : step < current
                  ? 'bg-blue-500/80'
                  : 'bg-white/[0.1]'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

function StepTitle({ Icon, title, desc }) {
  return (
    <div className="px-6 pt-4 pb-2">
      <div className="mb-2">
        {Icon ? <Icon className="w-5 h-5 text-slate-300" /> : null}
      </div>
      <h2 className="text-lg font-bold text-white mb-1">{title}</h2>
      <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
    </div>
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
function StepIdentity({ data, analyzed, onChange, onNext }) {
  const [title, setTitle]   = useState(data.title   || '')
  const [company, setCompany] = useState(data.company || '')
  const [period, setPeriod] = useState(data.period  || '')

  const next = () => {
    onChange({ title: title || 'Novo Relatório', company, period })
    onNext()
  }

  return (
    <>
      <StepTitle Icon={ClipboardList} title="Identificação do relatório" desc="Defina o nome e contexto do seu relatório" />
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
                <span className="inline-flex items-center gap-1.5">
                  {c.type === 'date' ? <CalendarDays className="w-3.5 h-3.5" /> : c.type === 'number' ? <DollarSign className="w-3.5 h-3.5" /> : <Tag className="w-3.5 h-3.5" />}
                  {c.name}
                </span>
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
function StepSaving({ data, onChange, onNext, onBack, onSkip, previewData, previewError, previewLoading }) {
  const [enabled, setEnabled] = useState(data.savingEnabled !== false)
  const [metricType, setMetricType] = useState(data.metricType || data.type || 'ECONOMIA')
  const [customLabel, setCustomLabel] = useState(data.label || '')
  const labelMap = {
    ECONOMIA: 'Economia',
    TOTAL: 'Total Financeiro',
    VARIACAO: 'Variação',
    TAXA: 'Taxa',
    VOLUME: 'Volume',
  }
  const label = labelMap[metricType] || labelMap.ECONOMIA

  const hasValidValue = value => value !== null && value !== undefined && Number.isFinite(Number(value))
  const fmtBRL = v => hasValidValue(v) ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—'
  const fmtN = v => hasValidValue(v) ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'
  const fmtPct = v => hasValidValue(v) ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—'
  const displayMode = getMetricDisplayMode(metricType)
  const metricTitle = label
  const metricColor = METRIC_COLORS[metricType] || METRIC_COLORS.ECONOMIA
  const primaryMetric = previewData?.summary?.primary_metric || null
  const previewMetricType = previewData?.metric?.type || ''
  const isPreviewStale = Boolean(previewMetricType) && previewMetricType !== metricType
  const isWaitingPreview = Boolean(previewLoading || isPreviewStale)
  const saving = primaryMetric?.value
  const breakdown = primaryMetric?.breakdown || null
  const detailItems = previewData?.detail_items || []
  const validationErrors = Array.isArray(previewData?.validation?.errors) ? previewData.validation.errors : []
  const validationWarnings = Array.isArray(previewData?.validation?.warnings) ? previewData.validation.warnings : []
  const validationMessage = previewError || validationErrors[0] || ''
  const hasValidationErrors = validationErrors.length > 0
  const hasBlockingValidation = Boolean(validationMessage) || isWaitingPreview
  const hasValidSaving = hasValidValue(saving)
  const hasBaseValue = hasValidValue(breakdown?.base_value)
  const hasPercentValue = hasValidValue(breakdown?.percent)
  const hasValidBreakdown = Boolean(breakdown) && hasBaseValue && hasPercentValue
  const numericSaving = hasValidSaving ? Number(saving) : NaN
  const isMonetaryMetric = metricType === 'ECONOMIA' || metricType === 'TOTAL'
  const hasMeaningfulValue = isMonetaryMetric ? numericSaving > 0 : hasValidSaving
  const hasMeaningfulBreakdown = metricType === 'ECONOMIA'
    ? (hasBaseValue && Number(breakdown?.base_value) > 0 && hasPercentValue && Number(breakdown?.percent) > 0)
    : hasValidBreakdown
  const canRenderMetric = !isWaitingPreview && !hasValidationErrors && hasValidSaving && hasMeaningfulValue

  useEffect(() => {
    onChange({
      savingEnabled: enabled,
      metricType,
      type: metricType,
    })
  }, [enabled, metricType, onChange])

  const next = () => {
    onChange({
      savingEnabled: enabled,
      label,
      metricType,
      type: metricType,
    })
    onNext()
  }

  const cardBg = `linear-gradient(135deg, ${metricColor} 0%, ${metricColor}cc 100%)`

  return (
    <>
      <StepTitle Icon={DollarSign} title="Configuração da métrica" desc="Escolha como o sistema calculará seu resultado principal" />
      <div className="px-6 pb-2 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.12]">
          <div className={`w-10 h-5 rounded-full relative transition-colors ${enabled ? '' : 'bg-white/10'}`} style={enabled ? { backgroundColor: metricColor } : undefined} onClick={() => setEnabled(e => !e)}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm font-semibold text-slate-200">Mostrar banner da métrica</span>
        </label>

        {enabled && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Tipo de métrica</label>
              <select value={metricType} onChange={e => setMetricType(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm text-white outline-none transition-colors" style={{ borderColor: metricColor, background: `${metricColor}14`, boxShadow: `0 0 0 1px ${metricColor}44 inset` }}>
                <option value="ECONOMIA">Economia</option>
                <option value="TOTAL">Total Financeiro</option>
                <option value="VARIACAO">Variação</option>
                <option value="TAXA">Taxa</option>
                <option value="VOLUME">Volume</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Rótulo da métrica</label>
              <input value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder={`Ex: ${metricTitle}`} className="w-full px-3 py-2 bg-white/[0.05] border rounded-lg text-sm text-white outline-none transition-colors" style={{ borderColor: metricColor, boxShadow: `0 0 0 1px ${metricColor}22 inset` }} />
            </div>

            {isWaitingPreview && (
              <div className="rounded-lg border border-blue-700/30 bg-blue-950/30 px-3 py-2 text-[11px] text-blue-100">
                Validando cálculo da métrica...
              </div>
            )}

            {!isWaitingPreview && validationMessage && (
              <div className="rounded-lg border border-rose-700/30 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-200">
                Não foi possível calcular essa métrica com os dados atuais. {validationMessage}
              </div>
            )}

            {!isWaitingPreview && !validationMessage && !hasValidationErrors && hasValidSaving && (
              <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/30 px-3 py-2 text-[11px] text-emerald-200">
                Métrica válida e pronta para uso
              </div>
            )}

            {!isWaitingPreview && !hasValidationErrors && hasValidSaving && !hasMeaningfulValue && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-300">
                Métrica calculada sem valor relevante no momento.
              </div>
            )}

            {hasBlockingValidation && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-300">
                {isWaitingPreview
                  ? 'Aguarde a validação da métrica antes de continuar'
                  : 'Ajuste os dados para continuar'}
              </div>
            )}

            {!isWaitingPreview && validationWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100 space-y-1">
                {validationWarnings.map((warning, index) => (
                  <div key={`${warning}-${index}`} className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}

            {canRenderMetric && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl p-4 flex items-center justify-between" style={{ background: cardBg }}>
                <div>
                  <div className="text-[10px] text-white/60 uppercase tracking-wider mb-1">{primaryMetric?.label || label}</div>
                  <div className="text-2xl font-bold font-mono" style={{ color: '#d1fae5' }}>
                    {hasValidSaving
                      ? (primaryMetric?.formatted_value ?? (displayMode === 'percent' ? fmtPct(saving) : displayMode === 'number' ? fmtN(saving) : fmtBRL(saving)))
                      : '—'}
                  </div>
                  <div className="mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/80" style={{ borderColor: `${metricColor}55`, background: `${metricColor}22` }}>
                    Tipo: {metricType} · {primaryMetric?.type || (displayMode === 'percent' ? 'percentual' : displayMode === 'number' ? 'quantidade' : 'monetário')}
                  </div>
                  {breakdown?.formula && (
                    <div className="mt-2 text-[10px] text-white/70">
                      Fórmula: {previewData?.summary?.primary_metric?.breakdown?.formula}
                    </div>
                  )}
                  {hasMeaningfulBreakdown && (
                    <div className="mt-1 text-[10px] text-white/70">
                      {hasBaseValue ? `Base: ${fmtBRL(breakdown.base_value)}` : ''}
                      {hasBaseValue && hasPercentValue ? ' · ' : ''}
                      {hasPercentValue ? `Percentual: ${fmtPct(breakdown.percent)}` : ''}
                    </div>
                  )}
                  {detailItems.length > 0 && (
                    <div className="flex items-center gap-3 mt-2">
                      {detailItems.map((item, index) => (
                        <div key={`${item.label}-${index}`} className="flex items-center gap-3">
                          {index > 0 && <span className="text-white/30 text-sm">→</span>}
                          <div>
                            <div className={`text-xs font-bold font-mono ${item.accent ? 'text-green-400' : 'text-white'}`}>
                              {item.kind === 'percent' ? fmtPct(item.value) : item.kind === 'number' ? fmtN(item.value) : fmtBRL(item.value)}
                            </div>
                            <div className="text-[9px] text-white/50">{item.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <TrendingUp className="w-8 h-8 opacity-20" />
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
      <NavButtons onBack={onBack} onNext={next} onSkip={onSkip} nextDisabled={hasBlockingValidation} />
    </>
  )
}

// Step 3: KPIs
function StepKPIs({ data, analyzed, onChange, onNext, onBack, onSkip }) {
  const ICONS = [
    { value: 'bar', label: 'Bar Chart' },
    { value: 'dollar', label: 'Dollar' },
    { value: 'list', label: 'List' },
    { value: 'trophy', label: 'Trophy' },
    { value: 'trending', label: 'Trending' },
    { value: 'check', label: 'Check' },
  ]
  const FMTS  = [
    { value: 'count', label: 'Total registros' },
    { value: 'sum',   label: 'Soma Σ' },
    { value: 'avg',   label: 'Média' },
    { value: 'max',   label: 'Máximo' },
    { value: 'topval',label: 'Mais frequente' },
    { value: 'countuniq', label: 'Valores únicos' },
  ]

  const [kpis, setKpis] = useState(data.kpis?.length ? data.kpis : [
    { label: 'Total Registros', icon: 'list', col: '', fmt: 'count', color: '#3b82f6' },
    { label: 'Valor Total', icon: 'dollar', col: String(analyzed.filter(c => isNumericType(c.type))[0]?.i ?? ''), fmt: 'sum', color: '#16a34a' },
    { label: 'Top Categoria', icon: 'trophy', col: String(analyzed.filter(c => c.type === 'text' && c.uniq >= 2)[0]?.i ?? ''), fmt: 'topval', color: '#f59e0b' },
  ])

  const addKpi = () => setKpis(k => [...k, { label: 'Novo KPI', icon: 'bar', col: '', fmt: 'count', color: '#8b5cf6' }])
  const remKpi = i => setKpis(k => k.filter((_, j) => j !== i))
  const updKpi = (i, patch) => setKpis(k => k.map((kpi, j) => j === i ? { ...kpi, ...patch } : kpi))

  const next = () => { onChange({ kpis }); onNext() }

  return (
    <>
      <StepTitle Icon={BarChart3} title="Indicadores (KPIs)" desc="Adicione métricas auxiliares para enriquecer a análise" />
      <div className="px-6 pb-2 space-y-2 max-h-[340px] overflow-y-auto">
        {kpis.map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <select value={kpi.icon} onChange={e => updKpi(i, { icon: e.target.value })} className="w-24 h-8 bg-white/[0.06] border border-white/[0.1] rounded-lg text-xs text-center outline-none">
                {ICONS.map(ic => <option key={ic.value} value={ic.value}>{ic.label}</option>)}
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
    { value: 'doughnut', label: 'Donut' },
    { value: 'pie',      label: 'Pizza' },
    { value: 'bar',      label: 'Barras verticais' },
    { value: 'hbar',     label: 'Barras horizontais' },
  ]
  const CHART_TYPES2 = [
    { value: 'bar',      label: 'Barras verticais' },
    { value: 'hbar',     label: 'Barras horizontais' },
    { value: 'doughnut', label: 'Donut' },
    { value: 'line',     label: 'Linha' },
  ]

  return (
    <>
      <StepTitle Icon={BarChart3} title="Gráficos de distribuição" desc="Visualize como os dados se distribuem por categorias" />
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
  const nums  = analyzed.filter(c => isNumericType(c.type))
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
      <StepTitle Icon={TrendingUp} title="Análises avançadas" desc="Explore tendências e rankings dos seus dados" />
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

export default function SetupWizard({ rows, cols, onComplete, onDismiss, previewData, previewError, previewLoading, onDraftChange }) {
  const [step, setStep]     = useState(1)
  const [wdata, setWdata]   = useState({})
  const [finishing, setFinishing] = useState(false)
  const analyzed            = useMemo(() => detectColumns(cols, rows), [cols, rows])

  const update = useCallback((patch) => {
    setWdata(d => ({ ...d, ...patch }))
  }, [])
  const next   = ()    => setStep(s => s + 1)
  const back   = ()    => setStep(s => s - 1)
  const skip   = ()    => setStep(s => s + 1)

  useEffect(() => {
    if (step !== 2) return
    const seedMetricType = wdata.metricType || wdata.type || 'ECONOMIA'
    const seedLabel = wdata.label || METRIC_LABELS[seedMetricType] || METRIC_LABELS.ECONOMIA
    setWdata(prev => {
      const nextSavingEnabled = prev.savingEnabled !== false
      if (
        prev.savingEnabled === nextSavingEnabled &&
        prev.metricType === seedMetricType &&
        prev.type === seedMetricType &&
        prev.label === seedLabel
      ) {
        return prev
      }
      return {
        ...prev,
        savingEnabled: nextSavingEnabled,
        metricType: seedMetricType,
        type: seedMetricType,
        label: seedLabel,
      }
    })
  }, [step, wdata.metricType, wdata.type, wdata.label])

  useEffect(() => {
    onDraftChange?.({ rows, cols, ...wdata, analyzed })
  }, [rows, cols, wdata, analyzed, onDraftChange])

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
      footer:  'Relatório gerado pelo Report Flow · Uso interno',

      saving: {
        metricType:       wdata.metricType || 'ECONOMIA',
        type:             wdata.metricType || 'ECONOMIA',
        label:            wdata.label || 'Economia',
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
          source: 'distribution',
          title: wdata.g1col !== '' ? `Distribuição por ${a[parseInt(wdata.g1col)]?.name || ''}` : 'Distribuição',
          type:  wdata.g1type || 'doughnut',
          col:   ci(wdata.g1col),
          h: 260,
        },
        g2: {
          on:    wdata.g2on !== false,
          source: 'by_category',
          title: wdata.g2col !== '' ? `Contratos por ${a[parseInt(wdata.g2col)]?.name || ''}` : 'Por Categoria',
          type:  wdata.g2type || 'bar',
          col:   ci(wdata.g2col),
          h: 260,
        },
        g3: {
          on:      wdata.g3on !== false,
          source:  'by_date',
          title:   'Evolução Mensal',
          type:    'line',
          dateCol: ci(wdata.g3date),
          v1Col:   ci(wdata.g3v1),
          v2Col:   ci(wdata.g3v2),
          h: 300,
        },
        g4: {
          on:       wdata.g4on !== false,
          source:   'top_items',
          title:    wdata.g4label !== '' ? `Top ${wdata.g4n || 10} por ${a[parseInt(wdata.g4label)]?.name || ''}` : 'Top N por Valor',
          type:     'hbar',
          labelCol: ci(wdata.g4label),
          valCol:   ci(wdata.g4val),
          n:        wdata.g4n || 10,
          h: 400,
        },
      },

      groupCol: ci(wdata.g2col),
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

  const handleFinish = () => {
    setFinishing(true)
    window.setTimeout(() => {
      finish()
    }, 320)
  }

  const stepProps = { rows, analyzed, data: wdata, onChange: update }

  return (
    <AnimatePresence>
      <ModalBackdrop onClose={onDismiss}>
        <WizardCard wide={step >= 3}>
          <ProgressBar current={step} total={TOTAL_STEPS} />
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {step === 1 && <StepIdentity      {...stepProps} onNext={next} />}
              {step === 2 && <StepSaving        {...stepProps} previewData={previewData} previewError={previewError} previewLoading={previewLoading} onNext={next} onBack={back} onSkip={skip} />}
              {step === 3 && <StepKPIs          {...stepProps} onNext={next} onBack={back} onSkip={skip} />}
              {step === 4 && <StepChartsDist    {...stepProps} onNext={next} onBack={back} onSkip={skip} />}
              {step === 5 && (
                <>
                  <StepChartsAdvanced {...stepProps} onNext={handleFinish} onBack={back} onSkip={handleFinish} />
                  <AnimatePresence>
                    {finishing && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="mx-6 mb-5 -mt-2 rounded-lg border border-emerald-500/35 bg-emerald-900/30 px-3 py-2 text-xs font-semibold text-emerald-200"
                      >
                        Relatório configurado com sucesso
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </WizardCard>
      </ModalBackdrop>
    </AnimatePresence>
  )
}

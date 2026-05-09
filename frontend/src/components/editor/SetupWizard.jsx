import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronRight, ChevronLeft, X, Sparkles, DollarSign, BarChart3, TrendingUp, AlertTriangle, ClipboardList, CalendarDays, Tag, FileSpreadsheet } from 'lucide-react'

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
const labelClass = 'text-[10px] font-bold text-[color:var(--ts)] uppercase tracking-wider block mb-1.5'
const fieldClass = 'rf-control'
const compactFieldClass = 'rf-control text-xs py-2'
const sectionClass = 'rf-panel p-4 space-y-3'
const helperTextClass = 'text-[10px] text-[color:var(--tm)] mt-1'

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
      className="rf-page-surface fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      style={{ backdropFilter: 'blur(12px)' }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div className="pointer-events-none absolute inset-0 bg-[rgba(6,14,25,0.62)] dark:bg-[rgba(6,14,25,0.74)]" />
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
      className={`rf-panel-glass surface-3d relative max-h-[92vh] overflow-hidden ${wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'}`}
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
        <span className="text-[10px] font-bold text-brand-400 uppercase tracking-wider">Configuração do relatório</span>
        <span className="rf-badge text-[11px] font-semibold">Etapa {current} de {total}</span>
      </div>
      <div className="h-1.5 bg-[var(--s3)] rounded-full overflow-hidden border border-theme">
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, var(--rf-brand), var(--rf-accent))', boxShadow: '0 0 18px var(--rf-brand-glow)' }}
          initial={{ width: 0 }}
          animate={{ width: `${(current / total) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {steps.map(step => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-colors ${
              step === current
                ? 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.45)]'
                : step < current
                  ? 'bg-blue-500/80'
                  : 'bg-[var(--s3)]'
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
        {Icon ? <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-theme bg-[var(--s2)] text-brand-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"><Icon className="w-5 h-5" /></div> : null}
      </div>
      <h2 className="text-xl font-bold text-[color:var(--tp)] mb-1">{title}</h2>
      <p className="text-sm text-[color:var(--ts)] leading-relaxed">{desc}</p>
    </div>
  )
}

function ColSelect({ label, value, onChange, cols, filter, placeholder = '— selecionar —', hint }) {
  const options = filter ? cols.filter(filter) : cols
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className={fieldClass}
      >
        <option value="">{placeholder}</option>
        {options.map(c => <option key={c.i} value={String(c.i)}>{c.name}</option>)}
      </select>
      {hint && <p className={helperTextClass}>{hint}</p>}
    </div>
  )
}

function NavButtons({ onBack, onNext, nextLabel = 'Próximo', nextDisabled, onSkip, isLast }) {
  return (
    <div className="flex items-center gap-3 px-6 pb-6 pt-2">
      {onBack && (
        <button onClick={onBack} className="rf-btn-secondary flex items-center gap-1.5">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
      )}
      {onSkip && (
        <button onClick={onSkip} className="btn-ghost ml-auto">
          Pular
        </button>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className={`rf-btn-primary flex items-center gap-1.5 ${onSkip ? '' : 'ml-auto'}`}
      >
        {isLast ? <><Sparkles className="w-4 h-4" /> Gerar relatório!</> : <>{nextLabel} <ChevronRight className="w-4 h-4" /></>}
      </button>
    </div>
  )
}

// ── STEPS ─────────────────────────────────────────────────────────

const KIND_LABELS = {
  financial: 'Financeira',
  operational: 'Operacional',
  mixed: 'Mista',
  summary: 'Resumo',
  empty: 'Vazia',
}

function StepSheetSelection({ workbook, selectedSheetIndex, onSelect, onChange, onNext }) {
  const sheets = Array.isArray(workbook?.sheets) ? workbook.sheets : []
  const activeIndex = selectedSheetIndex ?? workbook?.selectedSheetIndex ?? sheets[0]?.sheetIndex

  const choose = (sheet) => {
    onSelect?.(sheet.sheetIndex)
    onChange?.({
      selectedSheetName: sheet.sheetName,
      selectedSheetIndex: sheet.sheetIndex,
      workbookMeta: {
        ...workbook?.workbookMeta,
        selectedSheetName: sheet.sheetName,
        selectedSheetIndex: sheet.sheetIndex,
      },
    })
  }

  return (
    <>
      <StepTitle Icon={FileSpreadsheet} title="Escolha a aba para análise" desc="Selecione qual aba do workbook será usada para gerar este relatório" />
      <div className="px-6 pb-2 space-y-3 max-h-[56vh] overflow-y-auto">
        {sheets.map(sheet => {
          const active = sheet.sheetIndex === activeIndex
          const kindLabel = KIND_LABELS[sheet.detectedKind] || sheet.detectedKind || 'Dados'
          const columns = (sheet.cols || []).filter(Boolean).slice(0, 5)
          const metrics = Array.isArray(sheet.recommendedMetrics) ? sheet.recommendedMetrics : []
          const warnings = Array.isArray(sheet.warnings) ? sheet.warnings : []

          return (
            <button
              type="button"
              key={`${sheet.sheetIndex}-${sheet.sheetName}`}
              onClick={() => choose(sheet)}
              className={`rf-panel w-full p-4 text-left transition-all hover:border-[color:var(--bdh)] ${active ? 'border-brand-500/60 bg-brand-900/15 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-[color:var(--tp)] truncate">{sheet.sheetName}</span>
                    {active && <span className="rf-badge text-[10px] text-brand-300">Selecionada</span>}
                  </div>
                  <div className="mt-1 text-[11px] text-[color:var(--tm)]">
                    {Number(sheet.rowCount || 0).toLocaleString('pt-BR')} linhas · {Number(sheet.colCount || 0).toLocaleString('pt-BR')} colunas
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-brand-300">{kindLabel}</div>
                  <div className="mt-1 font-mono text-sm font-bold text-[color:var(--tp)]">{Math.round(Number(sheet.score || 0))}</div>
                </div>
              </div>

              {columns.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {columns.map(column => (
                    <span key={column} className="rounded-full border border-theme bg-[var(--s2)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--ts)]">
                      {column}
                    </span>
                  ))}
                </div>
              )}

              {metrics.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {metrics.map(metric => (
                    <span key={metric} className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ borderColor: `${METRIC_COLORS[metric] || '#3b82f6'}55`, color: METRIC_COLORS[metric] || '#3b82f6', background: `${METRIC_COLORS[metric] || '#3b82f6'}18` }}>
                      {metric}
                    </span>
                  ))}
                </div>
              )}

              {warnings.length > 0 && (
                <div className="mt-3 space-y-1">
                  {warnings.slice(0, 2).map((warning, index) => (
                    <div key={`${warning}-${index}`} className="inline-flex items-start gap-1.5 text-[10px] text-amber-300">
                      <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
      <NavButtons onNext={onNext} nextLabel="Usar esta aba" />
    </>
  )
}

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
          <label className={labelClass}>Título do relatório</label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Contratos Procurement 2025"
            className={fieldClass}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Empresa / Área</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Ex: Acme Corp" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Período</label>
            <input value={period} onChange={e => setPeriod(e.target.value)} placeholder="Ex: Q1 2025" className={fieldClass} />
          </div>
        </div>

        {/* Preview colunas detectadas */}
        <div className="rf-panel p-3 mt-1">
          <div className="text-[10px] font-bold text-[color:var(--ts)] uppercase tracking-wider mb-2">Colunas detectadas automaticamente</div>
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

  const cardBg = `radial-gradient(circle at 18% 12%, rgba(255,255,255,0.22), transparent 28%), linear-gradient(135deg, ${metricColor} 0%, ${metricColor}dd 52%, #0f172a 120%)`

  return (
    <>
      <StepTitle Icon={DollarSign} title="Configuração da métrica" desc="Escolha como o sistema calculará seu resultado principal" />
      <div className="px-6 pb-2 space-y-3">
        <label className="rf-panel flex items-center gap-3 cursor-pointer p-3 hover:border-[color:var(--bdh)]">
          <div className={`toggle-2d relative flex-shrink-0 ${enabled ? '' : ''}`} data-state={enabled ? 'checked' : 'unchecked'} style={enabled ? { backgroundColor: metricColor } : undefined} onClick={() => setEnabled(e => !e)}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm font-semibold text-[color:var(--tp)]">Mostrar banner da métrica</span>
        </label>

        {enabled && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
            <div>
              <label className={labelClass}>Tipo de métrica</label>
              <select value={metricType} onChange={e => setMetricType(e.target.value)} className={fieldClass} style={{ borderColor: metricColor, boxShadow: `0 0 0 1px ${metricColor}33 inset` }}>
                <option value="ECONOMIA">Economia</option>
                <option value="TOTAL">Total Financeiro</option>
                <option value="VARIACAO">Variação</option>
                <option value="TAXA">Taxa</option>
                <option value="VOLUME">Volume</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Rótulo da métrica</label>
              <input value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder={`Ex: ${metricTitle}`} className={fieldClass} style={{ borderColor: metricColor, boxShadow: `0 0 0 1px ${metricColor}22 inset` }} />
            </div>

            {isWaitingPreview && (
              <div className="rf-panel border-blue-500/30 px-3 py-2 text-[11px] text-brand-300">
                Validando cálculo da métrica...
              </div>
            )}

            {!isWaitingPreview && validationMessage && (
              <div className="rounded-lg border border-rose-500/35 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-200">
                Não foi possível calcular essa métrica com os dados atuais. {validationMessage}
              </div>
            )}

            {!isWaitingPreview && !validationMessage && !hasValidationErrors && hasValidSaving && (
              <div className="rounded-lg border border-emerald-500/35 bg-emerald-950/25 px-3 py-2 text-[11px] text-emerald-200">
                Métrica válida e pronta para uso
              </div>
            )}

            {!isWaitingPreview && !hasValidationErrors && hasValidSaving && !hasMeaningfulValue && (
              <div className="rf-panel px-3 py-2 text-[11px] text-[color:var(--ts)]">
                Métrica calculada sem valor relevante no momento.
              </div>
            )}

            {hasBlockingValidation && (
              <div className="rf-panel px-3 py-2 text-[11px] text-[color:var(--ts)]">
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
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rf-metric-hero p-4 sm:p-5 flex items-start justify-between gap-4"
                style={{ background: cardBg, boxShadow: `0 22px 52px ${metricColor}34, inset 0 1px 0 rgba(255,255,255,0.26)` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/25 bg-white/[0.12] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90">Métrica principal</span>
                    <span className="rounded-full border border-emerald-200/30 bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-100">Validada</span>
                  </div>
                  <div className="text-[10px] text-white/72 uppercase tracking-wider mb-1">{primaryMetric?.label || label}</div>
                  <div className="text-4xl sm:text-5xl font-extrabold font-mono leading-[1.02] break-words" style={{ color: '#f8fafc', textShadow: `0 0 30px ${metricColor}72` }}>
                    {hasValidSaving
                      ? (primaryMetric?.formatted_value ?? (displayMode === 'percent' ? fmtPct(saving) : displayMode === 'number' ? fmtN(saving) : fmtBRL(saving)))
                      : '—'}
                  </div>
                  <div className="mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]" style={{ borderColor: 'rgba(255,255,255,0.26)', background: 'rgba(255,255,255,0.12)' }}>
                    Tipo: {metricType} · {primaryMetric?.type || (displayMode === 'percent' ? 'percentual' : displayMode === 'number' ? 'quantidade' : 'monetário')}
                  </div>
                  {breakdown?.formula && (
                    <div className="mt-2 text-[10px] text-white/70">
                      Fórmula: {previewData?.summary?.primary_metric?.breakdown?.formula}
                    </div>
                  )}
                  {hasMeaningfulBreakdown && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {hasBaseValue && (
                        <div className="rounded-lg border border-white/20 bg-white/[0.10] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                          <div className="text-[9px] uppercase tracking-wider text-white/60">Base</div>
                          <div className="text-sm font-bold font-mono text-white">{fmtBRL(breakdown.base_value)}</div>
                        </div>
                      )}
                      {hasPercentValue && (
                        <div className="rounded-lg border border-white/20 bg-white/[0.10] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                          <div className="text-[9px] uppercase tracking-wider text-white/60">Percentual</div>
                          <div className="text-sm font-bold font-mono text-white">{fmtPct(breakdown.percent)}</div>
                        </div>
                      )}
                    </div>
                  )}
                  {detailItems.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                      {detailItems.map((item, index) => (
                        <div key={`${item.label}-${index}`} className="rounded-lg border border-white/20 bg-white/[0.09] px-3 py-2">
                          <div className={`text-xs font-bold font-mono ${item.accent ? 'text-emerald-200' : 'text-white'}`}>
                            {item.kind === 'percent' ? fmtPct(item.value) : item.kind === 'number' ? fmtN(item.value) : fmtBRL(item.value)}
                          </div>
                          <div className="text-[9px] text-white/60">{item.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="hidden sm:flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                  <TrendingUp className="w-7 h-7 opacity-75" />
                </div>
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
            className="rf-kpi-card p-3 space-y-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <select value={kpi.icon} onChange={e => updKpi(i, { icon: e.target.value })} className="rf-control w-24 h-9 py-1 text-xs text-center">
                {ICONS.map(ic => <option key={ic.value} value={ic.value}>{ic.label}</option>)}
              </select>
              <input value={kpi.label} onChange={e => updKpi(i, { label: e.target.value })} placeholder="Rótulo" className="rf-control flex-1 min-w-[150px] py-2 text-sm" />
              <input type="color" value={kpi.color || '#3b82f6'} onChange={e => updKpi(i, { color: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
              <button onClick={() => remKpi(i)} className="icon-action w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-900/30 hover:text-red-400 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-[color:var(--tm)] font-bold uppercase block mb-1">Coluna</label>
                <select value={kpi.col ?? ''} onChange={e => updKpi(i, { col: e.target.value })} className={compactFieldClass}>
                  <option value="">— total registros —</option>
                  {analyzed.map(c => <option key={c.i} value={String(c.i)}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-[color:var(--tm)] font-bold uppercase block mb-1">Cálculo</label>
                <select value={kpi.fmt || 'count'} onChange={e => updKpi(i, { fmt: e.target.value })} className={compactFieldClass}>
                  {FMTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>
          </motion.div>
        ))}
        {kpis.length < 6 && (
          <button onClick={addKpi} className="card-clickable w-full py-2.5 border-dashed rounded-xl text-[color:var(--ts)] hover:text-[color:var(--tp)] text-sm transition-all">
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
        <div className={sectionClass}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[color:var(--tp)]">Gráfico 1 — Distribuição</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="toggle-2d relative cursor-pointer" data-state={g1on ? 'checked' : 'unchecked'} onClick={() => setG1on(v => !v)}>
                <div className="toggle-2d-thumb absolute top-[0.18rem] left-[0.18rem]" />
              </div>
            </label>
          </div>
          {g1on && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ColSelect label="Coluna de categoria" value={g1col} onChange={setG1col} cols={cats} hint={cats[0] ? `${cats[0].uniq} valores únicos` : ''} />
              <div>
                <label className={labelClass}>Tipo de gráfico</label>
                <select value={g1type} onChange={e => setG1type(e.target.value)} className={fieldClass}>
                  {CHART_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* G2 */}
        <div className={sectionClass}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[color:var(--tp)]">Gráfico 2 — Por Categoria</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="toggle-2d relative cursor-pointer" data-state={g2on ? 'checked' : 'unchecked'} onClick={() => setG2on(v => !v)}>
                <div className="toggle-2d-thumb absolute top-[0.18rem] left-[0.18rem]" />
              </div>
            </label>
          </div>
          {g2on && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ColSelect label="Coluna de categoria" value={g2col} onChange={setG2col} cols={cats} />
              <div>
                <label className={labelClass}>Tipo de gráfico</label>
                <select value={g2type} onChange={e => setG2type(e.target.value)} className={fieldClass}>
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
        <div className={sectionClass}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-[color:var(--tp)]">Evolução Temporal</span>
              {dates.length === 0 && <span className="ml-2 text-[10px] text-amber-400 bg-amber-900/20 border border-amber-700/30 px-2 py-0.5 rounded-full">nenhuma coluna de data detectada</span>}
            </div>
            <div className="toggle-2d relative cursor-pointer" data-state={g3on ? 'checked' : 'unchecked'} onClick={() => setG3on(v => !v)}>
              <div className="toggle-2d-thumb absolute top-[0.18rem] left-[0.18rem]" />
            </div>
          </div>
          {g3on && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ColSelect label="Coluna de DATA" value={g3date} onChange={setG3date} cols={[...dates, ...analyzed.filter(c => c.type === 'text' && /data|dt_|date|mes|ano/i.test(c.name))]} />
              <ColSelect label="Valor 1 (linha)" value={g3v1} onChange={setG3v1} cols={nums} />
              <ColSelect label="Valor 2 (linha)" value={g3v2} onChange={setG3v2} cols={nums} placeholder="— opcional —" />
            </div>
          )}
        </div>

        {/* G4 Top N */}
        <div className={sectionClass}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[color:var(--tp)]">Top N por Valor</span>
            <div className="toggle-2d relative cursor-pointer" data-state={g4on ? 'checked' : 'unchecked'} onClick={() => setG4on(v => !v)}>
              <div className="toggle-2d-thumb absolute top-[0.18rem] left-[0.18rem]" />
            </div>
          </div>
          {g4on && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ColSelect label="Coluna de rótulo" value={g4label} onChange={setG4label} cols={cats} hint="Ex: Fornecedor" />
              <ColSelect label="Coluna de valor" value={g4val} onChange={setG4val} cols={nums} hint="Soma por grupo" />
              <div>
                <label className={labelClass}>Top N</label>
                <select value={g4n} onChange={e => setG4n(parseInt(e.target.value))} className={fieldClass}>
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
const BASE_TOTAL_STEPS = 5

export default function SetupWizard({ rows, cols, onComplete, onDismiss, previewData, previewError, previewLoading, onDraftChange, workbook, selectedSheetIndex, onSheetSelect }) {
  const [step, setStep]     = useState(1)
  const [wdata, setWdata]   = useState({})
  const [finishing, setFinishing] = useState(false)
  const hasSheetStep = (workbook?.sheets || []).filter(sheet => sheet?.useful !== false).length > 1
  const totalSteps = BASE_TOTAL_STEPS + (hasSheetStep ? 1 : 0)
  const sheetStep = hasSheetStep ? 1 : 0
  const identityStep = hasSheetStep ? 2 : 1
  const savingStep = hasSheetStep ? 3 : 2
  const kpiStep = hasSheetStep ? 4 : 3
  const chartsStep = hasSheetStep ? 5 : 4
  const advancedStep = hasSheetStep ? 6 : 5
  const analyzed            = useMemo(() => detectColumns(cols, rows), [cols, rows])

  const update = useCallback((patch) => {
    setWdata(d => ({ ...d, ...patch }))
  }, [])
  const next   = ()    => setStep(s => s + 1)
  const back   = ()    => setStep(s => s - 1)
  const skip   = ()    => setStep(s => s + 1)

  useEffect(() => {
    if (step !== savingStep) return
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
  }, [step, savingStep, wdata.metricType, wdata.type, wdata.label])

  useEffect(() => {
    onDraftChange?.({
      rows,
      cols,
      ...wdata,
      analyzed,
      selectedSheetName: workbook?.selectedSheetName,
      selectedSheetIndex: workbook?.selectedSheetIndex,
      workbookMeta: workbook?.workbookMeta,
    })
  }, [rows, cols, wdata, analyzed, onDraftChange, workbook?.selectedSheetName, workbook?.selectedSheetIndex, workbook?.workbookMeta])

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
        <WizardCard wide={step >= kpiStep || step === sheetStep}>
          <ProgressBar current={step} total={totalSteps} />
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {hasSheetStep && step === sheetStep && <StepSheetSelection workbook={workbook} selectedSheetIndex={selectedSheetIndex} onSelect={onSheetSelect} onChange={update} onNext={next} />}
              {step === identityStep && <StepIdentity      {...stepProps} onNext={next} />}
              {step === savingStep && <StepSaving        {...stepProps} previewData={previewData} previewError={previewError} previewLoading={previewLoading} onNext={next} onBack={back} onSkip={skip} />}
              {step === kpiStep && <StepKPIs          {...stepProps} onNext={next} onBack={back} onSkip={skip} />}
              {step === chartsStep && <StepChartsDist    {...stepProps} onNext={next} onBack={back} onSkip={skip} />}
              {step === advancedStep && (
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

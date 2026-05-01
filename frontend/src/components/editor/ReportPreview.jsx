import { useEffect, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { motion } from 'motion/react'
import { useThemeStore } from '@/store/themeStore'
import InsightsPanel from '@/components/InsightsPanel'

function TableSection({ rows, visCols, dark, cardBg, bdColor, p1, p2, textColor, subText, showFilters = true }) {
  const [selectedCol, setSelectedCol] = useState('')
  const [selectedVal, setSelectedVal] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const searchRef = useRef(null)

  const categoricalCols = visCols
    .map(vc => {
      const vals = [...new Set(rows.map(r => String(r.cells?.[vc.i] ?? '').trim()).filter(Boolean))].sort()
      return vals.length >= 2 && vals.length <= 40 ? { ...vc, vals } : null
    })
    .filter(Boolean)

  const activeCol = categoricalCols.find(c => String(c.i) === selectedCol)
  let filteredRows = rows

  if (showFilters && globalSearch.trim()) {
    const q = globalSearch.toLowerCase()
    filteredRows = filteredRows.filter(r => r.cells?.some(c => String(c).toLowerCase().includes(q)))
  }

  if (showFilters && activeCol && selectedVal) {
    filteredRows = filteredRows.filter(r => String(r.cells?.[activeCol.i] ?? '') === selectedVal)
  }

  const hasFilter = showFilters && (globalSearch.trim() || (selectedCol && selectedVal))
  const activeFilterCount = (globalSearch.trim() ? 1 : 0) + (selectedCol && selectedVal ? 1 : 0)
  const inputStyle = { background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${bdColor}`, borderRadius: 6, color: textColor, fontSize: '0.72rem', padding: '0.25rem 0.5rem', outline: 'none', width: '100%' }
  const pillStyle = { ...inputStyle, borderRadius: 999, padding: '0.38rem 0.75rem' }

  useEffect(() => {
    if (!showFilters) return
    const onKey = e => {
      if (e.key !== '/') return
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showFilters])

  return (
    <div className="rounded-2xl shadow-sm overflow-hidden mb-5" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${bdColor}` }}>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: p2 }}>
          Todos os Registros — {hasFilter ? `${filteredRows.length} de ${rows.length}` : rows.length.toLocaleString('pt-BR')}
        </span>
        <div className="flex items-center gap-2">
          {hasFilter && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(37,99,235,0.2)', color: '#60a5fa' }}>{activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''}</span>}
          {hasFilter && <button onClick={() => { setSelectedCol(''); setSelectedVal(''); setGlobalSearch('') }} style={{ fontSize: '0.7rem', color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 5, padding: '0.15rem 0.5rem' }}>x Limpar</button>}
        </div>
      </div>
      {showFilters && (
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${bdColor}`, background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)' }}>
          <input ref={searchRef} style={{ ...pillStyle, marginBottom: '0.6rem' }} placeholder="Buscar em todos os campos... (/)" value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} />
          {categoricalCols.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,220px) minmax(220px,1fr)', gap: '0.5rem' }}>
              <select style={{ ...pillStyle, borderColor: selectedCol ? '#3b82f6' : bdColor, appearance: 'none', cursor: 'pointer' }} value={selectedCol} onChange={e => { setSelectedCol(e.target.value); setSelectedVal('') }}>
                <option value="">Filtrar por campo...</option>
                {categoricalCols.map(vc => <option key={vc.i} value={String(vc.i)}>{vc.name}</option>)}
              </select>
              <select style={{ ...pillStyle, borderColor: selectedVal ? '#3b82f6' : bdColor, appearance: 'none', cursor: 'pointer' }} value={selectedVal} onChange={e => setSelectedVal(e.target.value)} disabled={!activeCol}>
                <option value="">{activeCol ? 'Selecionar valor...' : 'Selecione um campo primeiro'}</option>
                {(activeCol?.vals || []).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto" style={{ maxHeight: 380 }}>
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0">
            <tr style={{ background: p1, color: '#fff' }}>
              {visCols.map((c, i) => <th key={i} className="px-3 py-2 text-left font-semibold uppercase text-[10px] tracking-wider whitespace-nowrap">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredRows.slice(0, 200).map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? (dark ? 'rgba(255,255,255,0.02)' : '#f8fafc') : 'transparent' }}>
                {visCols.map((c, ci_) => <td key={ci_} className="px-3 py-1.5 whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis" style={{ color: textColor }}>{row.cells?.[c.i] ?? ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRows.length === 0 && <div className="text-center py-8" style={{ color: subText }}>Nenhum registro encontrado</div>}
      </div>
    </div>
  )
}

const PAL_DARK = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#eab308']
const PAL_LIGHT = ['#1d4ed8', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0f766e', '#ca8a04']

const fmtBRL = v => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
const fmtN = v => Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const fmtPct = v => `${fmtN(v)}%`
const METRIC_COLORS = {
  ECONOMIA: '#16A34A',
  TOTAL: '#2563EB',
  VARIACAO: '#F59E0B',
  TAXA: '#7C3AED',
  VOLUME: '#6B7280',
}

function formatMetricValue(metricType, value, unit) {
  if (unit === 'percent' || metricType === 'TAXA' || metricType === 'VARIACAO') return fmtPct(value)
  if (unit === 'number' || metricType === 'VOLUME') return fmtN(value)
  return fmtBRL(value)
}

function getTheme(dark) {
  return {
    bg: 'transparent',
    textColor: dark ? '#94a3b8' : '#64748b',
    axisLine: dark ? '#1c3350' : '#e2e8f0',
    splitLine: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    tooltip: dark
      ? { bg: '#0d1a26', border: 'rgba(255,255,255,0.12)', text: '#d9e2ec' }
      : { bg: '#ffffff', border: 'rgba(0,0,0,0.12)', text: '#1e293b' },
    pal: dark ? PAL_DARK : PAL_LIGHT,
  }
}

function baseOpts(t) {
  return {
    backgroundColor: t.bg,
    textStyle: { color: t.textColor, fontFamily: 'DM Sans, system-ui' },
    tooltip: {
      backgroundColor: t.tooltip.bg,
      borderColor: t.tooltip.border,
      textStyle: { color: t.tooltip.text, fontSize: 12 },
      extraCssText: 'box-shadow:0 8px 24px rgba(0,0,0,.3);border-radius:10px;padding:10px 14px',
    },
    animation: true,
    animationDuration: 600,
    animationEasing: 'cubicOut',
  }
}

function EChart({ option, h = 240, style }) {
  return <ReactECharts option={option} style={{ height: h, width: '100%', ...style }} opts={{ renderer: 'canvas' }} notMerge />
}

function ChartCard({ title, h = 240, full = false, children }) {
  const { dark } = useThemeStore()
  return (
    <motion.div initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }}
      className={`rounded-2xl p-4 shadow-sm ${full ? 'col-span-2' : ''}`}
      style={{ background: dark ? '#0d1a26' : '#ffffff', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}` }}>
      <div className="text-xs font-bold uppercase tracking-wider mb-3 pb-2" style={{ color: dark ? '#94a3b8' : '#64748b', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'}` }}>
        {title}
      </div>
      <div style={{ height: h }}>{children}</div>
    </motion.div>
  )
}

function formatConfidence(value) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return '0%'
  return `${Math.round(numeric * 100)}%`
}

function confidenceLabel(value) {
  const numeric = Number(value ?? 0)
  if (numeric >= 0.85) return 'Alta confiança'
  if (numeric >= 0.7) return 'Confiança média'
  return 'Baixa confiança'
}

function humanizeEvidence(pattern) {
  const map = {
    money_keyword: 'Nome da coluna sugere valor monetário',
    percent_keyword: 'Nome da coluna sugere percentual',
    date_keyword: 'Nome da coluna sugere data',
    category_keyword: 'Nome da coluna sugere categoria',
  }

  return map[pattern] || 'Padrão identificado automaticamente'
}

function dedupeWarnings(values) {
  if (!Array.isArray(values)) return []
  const normalized = values
    .map(value => String(value || '').trim())
    .filter(Boolean)
  return [...new Set(normalized)]
}

function getDiagnosticMeta(columnName, columnInfo, mapping) {
  const kind = columnInfo?.kind || 'text'
  const confidence = columnInfo?.confidence ?? 0
  const evidence = columnInfo?.evidence || {}
  const warnings = dedupeWarnings(columnInfo?.warnings)
  const mappingLabel = Object.entries(mapping || {}).find(([, value]) => value === columnName)?.[0] || null

  return {
    kind,
    confidence,
    evidence,
    warnings,
    mappingLabel,
  }
}

function shouldEnableOverride(field, mapping, analysisColumns) {
  const mappedColumn = mapping?.[field]
  if (!mappedColumn) return false
  const info = analysisColumns?.[mappedColumn]
  if (!info) return false
  const confidence = Number(info.confidence ?? 0)
  const hasWarnings = Array.isArray(info.warnings) && info.warnings.length > 0
  return confidence < 0.85 || hasWarnings
}

function getOverrideOptions(field, mapping, analysisColumns, cols) {
  const kindByField = {
    monetary: new Set(['monetary']),
    percent: new Set(['percent']),
    category: new Set(['category', 'text']),
  }
  const allowedKinds = kindByField[field] || new Set()
  const analysisKeys = Object.keys(analysisColumns || {})
  const filteredFromAnalysis = analysisKeys.filter(name => allowedKinds.has(analysisColumns?.[name]?.kind))
  const fallbackByCols = (Array.isArray(cols) ? cols : [])
    .map(col => col?.name)
    .filter(Boolean)

  const options = filteredFromAnalysis.length > 0 ? filteredFromAnalysis : fallbackByCols
  const mapped = mapping?.[field]
  if (mapped && !options.includes(mapped)) return [mapped, ...options]
  return options
}

function OverridePanel({ enabled, mapping, analysisColumns, cols, override, onChange, dark, cardBg, bdColor, subText, textColor }) {
  if (!enabled) return null

  const fields = [
    ['monetary', 'Coluna monetária'],
    ['percent', 'Coluna percentual'],
    ['category', 'Coluna categórica'],
  ].filter(([field]) => shouldEnableOverride(field, mapping, analysisColumns))

  if (fields.length === 0) return null

  return (
    <div className="rounded-2xl p-4 mb-4" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
      <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: textColor }}>
        Ajustar sugestão do sistema
      </div>
      <div className="text-[11px] mb-3" style={{ color: subText }}>
        Use apenas se precisar corrigir o mapeamento sugerido automaticamente.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {fields.map(([field, label]) => {
          const options = getOverrideOptions(field, mapping, analysisColumns, cols)
          const selected = override?.[field] || mapping?.[field] || ''
          return (
            <div key={field}>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: subText }}>
                {label}
              </label>
              <select
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', color: textColor, border: `1px solid ${bdColor}` }}
                value={selected}
                onChange={event => onChange(field, event.target.value)}
              >
                <option value="">Não alterar</option>
                {options.map(option => (
                  <option key={`${field}-${option}`} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DiagnosticsPanel({ reportData, dark, cardBg, bdColor, textColor, subText, p2 }) {
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const analysisColumns = reportData?.analysis?.columns || {}
  const mapping = reportData?.mapping || {}
  const validation = reportData?.validation || { errors: [], warnings: [] }
  const columnEntries = Object.entries(analysisColumns)
  const globalWarnings = dedupeWarnings(validation.warnings)
  const globalErrors = Array.isArray(validation.errors) ? validation.errors : []
  const summaryItems = [
    ['Valor', mapping.monetary || '—'],
    ['Percentual', mapping.percent || '—'],
    ['Categoria', mapping.category || '—'],
  ]
  const displayMappingValue = value => value || 'Não identificado'

  return (
    <div className="rounded-2xl p-4 mb-5 shadow-sm" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
      <div className="mb-4 text-sm" style={{ color: subText, fontStyle: 'italic' }}>
        O sistema analisou automaticamente sua planilha e gerou este relatório com base nos dados identificados.
      </div>

      <div className="text-xs font-bold uppercase tracking-wider mb-3 pb-2" style={{ color: p2, borderBottom: `1px solid ${bdColor}` }}>
        Resumo do diagnóstico
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {summaryItems.map(([label, value]) => (
          <div key={label} className="rounded-xl p-3" style={{ background: dark ? '#102132' : '#f8fafc', border: `1px solid ${bdColor}` }}>
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: subText }}>
              {label}
            </div>
            <div className="text-sm font-semibold leading-tight" style={{ color: textColor }}>
              <strong>{displayMappingValue(value)}</strong>
            </div>
            {!value && (
              <div className="mt-1 text-[10px] italic" style={{ color: subText }}>
                ⚠ não detectado
              </div>
            )}
          </div>
        ))}
      </div>

      {globalErrors.length > 0 && (
        <div className="rounded-xl p-3 mb-4" style={{ background: dark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)' }}>
          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#ef4444' }}>
            Erros de validação
          </div>
          <div className="space-y-1">
            {globalErrors.map((error, index) => (
              <div key={`${error}-${index}`} className="text-sm" style={{ color: textColor }}>
                {error}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowDiagnostics(prev => !prev)}
        className="mb-3 rounded-full px-3 py-1 text-xs font-semibold transition-colors"
        style={{ background: dark ? 'rgba(37,99,235,0.12)' : 'rgba(37,99,235,0.08)', color: '#2563eb', border: '1px solid rgba(37,99,235,0.22)' }}
      >
        {showDiagnostics ? 'Ocultar diagnóstico técnico' : 'Ver diagnóstico técnico detalhado'}
      </button>

      {!showDiagnostics && (
        <div className="text-sm mb-4" style={{ color: subText }}>
          O resumo acima mostra as colunas escolhidas pelo backend. Abra o diagnóstico técnico para ver confiança, motivos e warnings detalhados.
        </div>
      )}

      {showDiagnostics && (
        <>
          {globalWarnings.length > 0 && (
            <div className="rounded-xl p-3 mb-4" style={{ background: dark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)' }}>
              <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#f59e0b' }}>
                Warnings globais
              </div>
              <div className="space-y-1">
                {globalWarnings.map((warning, index) => (
                  <div key={`${warning}-${index}`} className="text-sm" style={{ color: '#f59e0b' }}>
                    ⚠ {warning}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {columnEntries.length > 0 ? columnEntries.map(([columnName, columnInfo]) => {
              const meta = getDiagnosticMeta(columnName, columnInfo, mapping)
              return (
                <div key={columnName} className="rounded-xl p-4" style={{ background: dark ? '#102132' : '#f8fafc', border: `1px solid ${bdColor}` }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: textColor }}>
                        Coluna '{columnName}' detectada como {meta.kind} ({confidenceLabel(meta.confidence)}, {formatConfidence(meta.confidence)})
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: subText }}>
                        Motivo: {humanizeEvidence(meta.evidence.name_pattern)} · Padrão numérico: {meta.evidence.numeric_pattern || 'não analisado'}
                      </div>
                    </div>
                    {meta.mappingLabel && (
                      <span className="text-[10px] px-2 py-1 rounded-full font-semibold uppercase tracking-wider" style={{ background: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}>
                        {meta.mappingLabel}
                      </span>
                    )}
                  </div>

                  {Array.isArray(meta.evidence.sample_values) && meta.evidence.sample_values.length > 0 && (
                    <div className="mt-2 text-[11px]" style={{ color: subText }}>
                      Amostras: {meta.evidence.sample_values.join(', ')}
                    </div>
                  )}

                  {meta.warnings.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {meta.warnings.map((warning, index) => (
                        <span key={`${warning}-${index}`} className="text-[10px] px-2 py-1 rounded-full font-semibold" style={{ background: 'rgba(254,240,138,0.35)', color: '#f59e0b' }}>
                          ⚠ {warning}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            }) : (
              <div className="rounded-xl p-3" style={{ background: dark ? '#102132' : '#f8fafc', border: `1px solid ${bdColor}`, color: subText }}>
                Nenhuma coluna foi analisada pelo backend.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function PieChart({ data, labels, type = 'doughnut', h, dark }) {
  const t = getTheme(dark)
  const isNight = type === 'nightingale'
  const isDonut = type === 'doughnut'
  const option = {
    ...baseOpts(t),
    color: t.pal,
    legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { color: t.textColor, fontSize: 11 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    series: [{
      type: 'pie',
      radius: isDonut ? ['45%', '72%'] : isNight ? ['15%', '72%'] : ['0%', '72%'],
      center: ['42%', '50%'],
      roseType: isNight ? 'radius' : false,
      data: data.map((v, i) => ({ value: v, name: labels[i] })),
      label: { show: !isNight, formatter: '{b}\n{d}%', fontSize: 10, color: t.textColor },
      labelLine: { smooth: true, length: 8, length2: 6 },
      itemStyle: { borderRadius: isDonut ? 6 : 0, borderColor: dark ? '#0d1a26' : '#fff', borderWidth: 2 },
    }],
  }
  return <EChart option={option} h={h} />
}

function BarChart({ data, labels, horizontal = false, h, dark, isNum = false }) {
  const t = getTheme(dark)
  const option = {
    ...baseOpts(t),
    color: t.pal,
    grid: { left: horizontal ? '22%' : '3%', right: '4%', top: '6%', bottom: '12%', containLabel: !horizontal },
    xAxis: horizontal
      ? { type: 'value', axisLabel: { color: t.textColor, fontSize: 10, formatter: isNum ? v => fmtBRL(v).replace('R$\u00a0', '') : undefined }, splitLine: { lineStyle: { color: t.splitLine } }, axisLine: { lineStyle: { color: t.axisLine } } }
      : { type: 'category', data: labels, axisLabel: { color: t.textColor, fontSize: 10, interval: 0, rotate: labels.length > 8 ? 30 : 0 }, axisLine: { lineStyle: { color: t.axisLine } } },
    yAxis: horizontal
      ? { type: 'category', data: labels, axisLabel: { color: t.textColor, fontSize: 10 }, axisLine: { lineStyle: { color: t.axisLine } } }
      : { type: 'value', axisLabel: { color: t.textColor, fontSize: 10, formatter: isNum ? v => fmtBRL(v).replace('R$\u00a0', '') : undefined }, splitLine: { lineStyle: { color: t.splitLine } }, axisLine: { lineStyle: { color: t.axisLine } } },
    tooltip: { ...baseOpts(t).tooltip, trigger: 'axis', formatter: isNum ? p => `${p[0].name}<br/>${fmtBRL(p[0].value)}` : undefined },
    series: [{
      type: 'bar',
      data: data.map((v, i) => ({ value: v, itemStyle: { color: t.pal[i % t.pal.length], borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0] } })),
      showBackground: true,
      backgroundStyle: { color: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0] },
    }],
  }
  return <EChart option={option} h={h} />
}

function LineChart({ labels, d1, d2, name1 = 'V1', name2 = 'V2', h, dark, isNum = false }) {
  const t = getTheme(dark)
  const mkSeries = (data, name, color) => ({
    type: 'line',
    name,
    data,
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: { width: 2.5, color },
    itemStyle: { color, borderColor: dark ? '#0d1a26' : '#fff', borderWidth: 2 },
    emphasis: { focus: 'series' },
  })
  const option = {
    ...baseOpts(t),
    color: t.pal,
    grid: { left: '3%', right: '4%', top: '14%', bottom: '12%', containLabel: true },
    legend: { top: 0, textStyle: { color: t.textColor, fontSize: 11 }, icon: 'roundRect', itemWidth: 14, itemHeight: 8 },
    xAxis: { type: 'category', data: labels, axisLabel: { color: t.textColor, fontSize: 10 }, axisLine: { lineStyle: { color: t.axisLine } }, boundaryGap: false },
    yAxis: { type: 'value', axisLabel: { color: t.textColor, fontSize: 10, formatter: isNum ? v => fmtBRL(v).replace('R$\u00a0', '') : undefined }, splitLine: { lineStyle: { color: t.splitLine } }, axisLine: { lineStyle: { color: t.axisLine } } },
    tooltip: { ...baseOpts(t).tooltip, trigger: 'axis', formatter: isNum ? p => `${p[0].axisValue}<br/>${p.map(s => `${s.marker}${s.seriesName}: ${fmtBRL(s.value)}`).join('<br/>')}` : undefined },
    series: [
      mkSeries(d1, name1, t.pal[0]),
      ...(d2 && d2.some(v => v !== 0) ? [mkSeries(d2, name2, t.pal[1])] : []),
    ],
  }
  return <EChart option={option} h={h} />
}

function KPICard({ kpi, dark }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 flex-1 min-w-[120px] text-center shadow-sm"
      style={{ background: dark ? '#0d1a26' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}`, borderTop: `4px solid ${kpi.color || '#3b82f6'}` }}>
      <div className="text-xl mb-1">{kpi.icon || '📊'}</div>
      <div className="text-lg font-extrabold font-mono break-words leading-tight" style={{ color: kpi.color || '#3b82f6' }}>{kpi.display ?? kpi.value ?? '—'}</div>
      <div className="text-[10px] mt-1 font-bold uppercase tracking-wider" style={{ color: dark ? '#486581' : '#94a3b8' }}>{kpi.label}</div>
    </motion.div>
  )
}

export default function ReportPreview({ state }) {
  const { dark } = useThemeStore()
  const { cols = [], colors = {}, sections = {} } = state
  const report = state?.report || { report_data: state?.reportData, reportData: state?.reportData }
  const reportData = report?.report_data || report?.reportData || {}
  const isNewSchema = reportData?.schemaVersion >= 1
  const visCols = cols.map((c, i) => ({ ...c, i })).filter(c => c.vis !== false)

  useEffect(() => {
    if (!isNewSchema) {
      console.warn('LEGACY FLOW ACTIVE: report without schemaVersion >= 1')
    }
  }, [isNewSchema])

  let previewError = ''
  let analysisColumns = {}
  let validation = { errors: [], warnings: [] }
  let mapping = {}
  let datasetPayload = []
  let datasetRows = []
  let summary = { rows: [], totals: {}, group_index: -1, primary_metric: null }
  let kpis = []
  let detailItems = []
  let metric = null
  let insights = []
  let charts = []
  let diagnosticsReportData = {}
  let override = null

  if (isNewSchema) {
    const dataset = reportData?.dataset || []
    const safeMapping = reportData?.mapping || {}
    const safeAnalysis = reportData?.analysis || {}
    const safeValidation = reportData?.validation || { errors: [], warnings: [] }

    previewError = reportData?.error || state.previewError || ''
    analysisColumns = safeAnalysis?.columns || {}
    validation = safeValidation
    mapping = safeMapping
    datasetPayload = dataset
    datasetRows = Array.isArray(dataset)
      ? dataset
      : Array.isArray(dataset?.rows)
        ? dataset.rows
        : []
    summary = reportData?.summary || { rows: [], totals: {}, group_index: -1, primary_metric: null }
    kpis = reportData?.kpis || []
    detailItems = reportData?.detail_items || []
    metric = reportData?.metric || summary?.primary_metric || null
    insights = reportData?.insights || []
    charts = reportData?.charts
    diagnosticsReportData = reportData
    override = state?.saving?.override || null
  } else {
    const legacyReportData = state.reportData || {}
    previewError = legacyReportData.error || state.previewError || ''
    analysisColumns = legacyReportData.analysis?.columns || {}
    validation = legacyReportData.validation || { errors: [], warnings: [] }
    mapping = legacyReportData.mapping || {}
    datasetPayload = legacyReportData.dataset
    datasetRows = Array.isArray(datasetPayload)
      ? datasetPayload
      : Array.isArray(datasetPayload?.rows)
        ? datasetPayload.rows
        : []
    summary = datasetPayload?.summary || { rows: [], totals: {}, group_index: -1, primary_metric: null }
    kpis = datasetPayload?.kpis || []
    detailItems = datasetPayload?.detail_items || []
    metric = legacyReportData.metric || null
    insights = legacyReportData.insights || []
    charts = legacyReportData.charts
    diagnosticsReportData = legacyReportData
    override = null
  }

  const hasDataset = Array.isArray(datasetRows)
  const hasValidationErrors = Array.isArray(validation.errors) && validation.errors.length > 0
  const dedupedValidationWarnings = dedupeWarnings(validation.warnings)
  const hasValidationWarnings = dedupedValidationWarnings.length > 0
  const hasAnalysis = Object.keys(analysisColumns).length > 0

  const p1 = colors.primary || '#1a3a5c'
  const p2 = colors.secondary || '#2e5c8a'
  const acc = colors.accent || '#4ade80'
  const bgColor = dark ? '#080f18' : '#eef1f5'
  const cardBg = dark ? '#0d1a26' : '#ffffff'
  const bdColor = dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'
  const textColor = dark ? '#d9e2ec' : '#1e293b'
  const subText = dark ? '#486581' : '#94a3b8'
  const primaryMetric = summary?.primary_metric || null
  const metricType = metric?.type || primaryMetric?.type || 'ECONOMIA'
  const metricColor = METRIC_COLORS[metricType] || METRIC_COLORS.ECONOMIA
  const savTotal = metric?.value ?? primaryMetric?.value ?? 0
  const recordCount = summary.totals?.count ?? datasetRows.length
  const summaryLabel = summary.group_index >= 0 ? cols[summary.group_index]?.name || '—' : '—'

  if (previewError) {
    return (
      <div className="p-4" style={{ background: bgColor, minHeight: '100%', color: textColor }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div className="rounded-2xl p-5" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#f87171' }}>
              Falha ao calcular o relatório
            </div>
            <div style={{ color: subText, fontSize: '0.9rem', lineHeight: 1.5 }}>
              {previewError}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (hasValidationErrors) {
    return (
      <div className="p-4" style={{ background: bgColor, minHeight: '100%', color: textColor }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div className="rounded-2xl p-5 mb-4" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#ef4444' }}>
              Erro de validação
            </div>
            <div className="space-y-1" style={{ color: subText, fontSize: '0.9rem', lineHeight: 1.5 }}>
              {validation.errors.map((error, index) => (
                <div key={`${error}-${index}`}>{error}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isNewSchema && datasetRows.length === 0) {
    return (
      <div className="p-4" style={{ background: bgColor, minHeight: '100%', color: textColor }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div className="rounded-2xl p-5 mb-5" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
            Nenhum dado pôde ser calculado com a configuração atual. Verifique sua planilha.
          </div>
          {hasValidationWarnings && (
            <div className="rounded-2xl p-4 mb-4" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
              <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#f59e0b' }}>
                Warnings globais
              </div>
              {dedupedValidationWarnings.map((warning, index) => (
                <div key={`${warning}-${index}`} style={{ color: '#f59e0b' }}>
                  ⚠ {warning}
                </div>
              ))}
            </div>
          )}
          {hasAnalysis && (
            <DiagnosticsPanel reportData={diagnosticsReportData} dark={dark} cardBg={cardBg} bdColor={bdColor} textColor={textColor} subText={subText} p2={p2} />
          )}
        </div>
      </div>
    )
  }

  if (!isNewSchema && (!hasDataset || datasetRows.length === 0)) {
    return (
      <div className="p-4" style={{ background: bgColor, minHeight: '100%', color: textColor }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div className="rounded-2xl p-5 mb-5" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
            Nenhum dado pôde ser calculado com a configuração atual. Verifique se sua planilha contém as colunas necessárias.
          </div>
          {hasAnalysis && (
            <DiagnosticsPanel reportData={diagnosticsReportData} dark={dark} cardBg={cardBg} bdColor={bdColor} textColor={textColor} subText={subText} p2={p2} />
          )}
          {hasValidationWarnings && (
            <div className="rounded-2xl p-4 mb-4" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
              <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#f59e0b' }}>
                Warnings globais
              </div>
              {dedupedValidationWarnings.map((warning, index) => (
                <div key={`${warning}-${index}`} style={{ color: '#f59e0b' }}>
                  ⚠ {warning}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderSummaryValue = value => formatMetricValue(metricType, value, metric?.unit)

  if (!Array.isArray(charts)) {
    return (
      <div className="p-4" style={{ background: bgColor, minHeight: '100%', color: textColor }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div className="rounded-2xl p-5" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
            O backend não enviou `reportData.charts` para este relatório.
          </div>
          <DiagnosticsPanel reportData={diagnosticsReportData} dark={dark} cardBg={cardBg} bdColor={bdColor} textColor={textColor} subText={subText} p2={p2} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4" style={{ background: bgColor, minHeight: '100%', color: textColor, transition: 'background .25s,color .25s' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div className="mb-6" style={{ position: 'relative', paddingBottom: '1.25rem' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 48, height: 3, borderRadius: 2, background: dark ? 'linear-gradient(90deg,#2563eb,#06b6d4)' : 'linear-gradient(90deg,#2563eb,#0ea5e9)' }} />
          <div style={{ paddingTop: '1rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.03em', color: textColor, lineHeight: 1.15, marginBottom: state.subtitle ? '0.2rem' : 0 }}>
                {state.title || 'Relatorio'}
              </h1>
              {state.subtitle && <p style={{ fontSize: '0.8rem', fontWeight: 400, color: subText, margin: 0 }}>{state.subtitle}</p>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {state.period && <span style={{ fontSize: '0.7rem', fontWeight: 500, color: dark ? '#64748b' : '#94a3b8', background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: `1px solid ${bdColor}`, borderRadius: 6, padding: '0.2rem 0.6rem' }}>{state.period}</span>}
              {state.company && <span style={{ fontSize: '0.7rem', fontWeight: 500, color: dark ? '#64748b' : '#94a3b8', background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: `1px solid ${bdColor}`, borderRadius: 6, padding: '0.2rem 0.6rem' }}>{state.company}</span>}
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: dark ? '#3b82f6' : '#2563eb', background: dark ? 'rgba(37,99,235,0.12)' : 'rgba(37,99,235,0.08)', border: `1px solid ${dark ? 'rgba(37,99,235,0.3)' : 'rgba(37,99,235,0.2)'}`, borderRadius: 6, padding: '0.2rem 0.6rem' }}>{recordCount.toLocaleString('pt-BR')} registros</span>
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: dark ? 'linear-gradient(90deg,rgba(37,99,235,0.4),rgba(255,255,255,0.05) 60%,transparent)' : 'linear-gradient(90deg,rgba(37,99,235,0.3),rgba(0,0,0,0.04) 60%,transparent)' }} />
        </div>

        {!isNewSchema && (
          <DiagnosticsPanel reportData={diagnosticsReportData} dark={dark} cardBg={cardBg} bdColor={bdColor} textColor={textColor} subText={subText} p2={p2} />
        )}

        {isNewSchema && hasValidationWarnings && (
          <div className="rounded-2xl p-4 mb-4" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#f59e0b' }}>
              Warnings globais
            </div>
            {dedupedValidationWarnings.map((warning, index) => (
              <div key={`${warning}-${index}`} style={{ color: '#f59e0b' }}>
                ⚠ {warning}
              </div>
            ))}
          </div>
        )}

        <OverridePanel
          enabled={isNewSchema}
          mapping={mapping}
          analysisColumns={analysisColumns}
          cols={cols}
          override={override}
          onChange={(field, value) => {
            const nextValue = String(value || '').trim()
            state?.update?.(prev => {
              const currentOverride = prev?.saving?.override || {}
              const nextOverride = {
                ...currentOverride,
                [field]: nextValue || undefined,
              }
              const normalizedOverride = Object.fromEntries(
                Object.entries(nextOverride).filter(([, val]) => typeof val === 'string' && val.trim() !== '')
              )
              return {
                ...prev,
                saving: {
                  ...(prev?.saving || {}),
                  override: Object.keys(normalizedOverride).length > 0 ? normalizedOverride : null,
                },
              }
            })
          }}
          dark={dark}
          cardBg={cardBg}
          bdColor={bdColor}
          subText={subText}
          textColor={textColor}
        />

        <InsightsPanel insights={insights} dark={dark} />

        {sections.saving !== false && (metric || primaryMetric) && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5 mb-5 flex items-center justify-between overflow-hidden relative"
            style={{ background: `linear-gradient(135deg,${p1},${p2})`, color: '#fff' }}>
            <div>
              <div className="text-xs opacity-60 uppercase tracking-widest mb-1">{primaryMetric?.label || metric?.label || 'Métrica principal'}</div>
              <div className="text-4xl font-extrabold font-mono" style={{ color: metricColor }}>
                {primaryMetric?.formatted_value || formatMetricValue(metricType, savTotal, metric?.unit)}
              </div>
              <div className="mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/80" style={{ borderColor: `${metricColor}55`, background: `${metricColor}22` }}>
                {(metric?.type || 'ECONOMIA')} · {primaryMetric?.type || (metricType === 'TAXA' || metricType === 'VARIACAO' ? 'percentual' : metricType === 'VOLUME' ? 'quantidade' : 'monetário')}
              </div>
              {detailItems.length > 0 && (
                <div className="flex gap-6 mt-3 flex-wrap items-center">
                  {detailItems.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-6">
                      {index > 0 && <div className="opacity-30 text-lg">→</div>}
                      <div>
                        <div className="text-sm font-bold font-mono" style={item.accent ? { color: acc } : undefined}>
                          {item.kind === 'percent' ? fmtPct(item.value) : item.kind === 'number' ? fmtN(item.value) : fmtBRL(item.value)}
                        </div>
                        <div className="text-[10px] opacity-50">{item.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="text-[80px] opacity-[0.07] select-none">💹</div>
          </motion.div>
        )}

        {sections.kpi !== false && kpis.length > 0 && (
          <div className="flex gap-3 mb-5 flex-wrap">
            {kpis.map((k, i) => <KPICard key={i} kpi={k} dark={dark} />)}
          </div>
        )}

        {sections.charts !== false && (
          charts.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 mb-5">
              {charts.map((chart, index) => (
                <ChartCard key={chart.id || index} title={chart.title || 'Gráfico'} h={chart.h || (index >= 2 ? 300 : 260)} full={!!chart.full}>
                  {chart.option
                    ? <EChart option={chart.option} h={chart.h || (index >= 2 ? 300 : 260)} />
                    : (
                      <div className="rounded-xl p-4 text-sm" style={{ background: dark ? '#102132' : '#f8fafc', border: `1px solid ${bdColor}`, color: subText }}>
                        O backend enviou este gráfico sem option de renderização.
                      </div>
                    )}
                </ChartCard>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl p-5 mb-5" style={{ background: cardBg, border: `1px solid ${bdColor}`, color: subText }}>
              Nenhum gráfico foi configurado pelo backend.
            </div>
          )
        )}

        {sections.summary !== false && summary.rows.length > 0 && (
          <div className="rounded-2xl p-4 mb-5 shadow-sm" style={{ background: cardBg, border: `1px solid ${bdColor}` }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-3 pb-2" style={{ color: p2, borderBottom: `1px solid ${bdColor}` }}>
              🗂 Resumo por {summaryLabel}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: p1, color: '#fff' }}>
                    <th className="px-3 py-2 text-left font-semibold">{summaryLabel}</th>
                    <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                    <th className="px-3 py-2 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((v, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? (dark ? 'rgba(255,255,255,0.02)' : '#f8fafc') : 'transparent' }}>
                      <td className="px-3 py-1.5">{v.label}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{v.count.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{renderSummaryValue(v.value)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: dark ? 'rgba(255,255,255,0.05)' : '#e2e8f0', fontWeight: 'bold', borderTop: `2px solid ${bdColor}` }}>
                    <td className="px-3 py-2">TOTAL GERAL</td>
                    <td className="px-3 py-2 text-right font-mono">{(summary.totals.count ?? 0).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2 text-right font-mono">{renderSummaryValue(summary.totals.value ?? savTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <TableSection rows={datasetRows} visCols={visCols} dark={dark} cardBg={cardBg} bdColor={bdColor} p1={p1} p2={p2} textColor={textColor} subText={subText} showFilters={sections.filters !== false} />

        {isNewSchema && (
          <DiagnosticsPanel reportData={diagnosticsReportData} dark={dark} cardBg={cardBg} bdColor={bdColor} textColor={textColor} subText={subText} p2={p2} />
        )}
      </div>
    </div>
  )
}

const METRIC_TYPES = {
  ECONOMIA: {
    type: 'ECONOMIA',
    label: 'Economia',
    color: '#16A34A',
  },
  TOTAL: {
    type: 'TOTAL',
    label: 'Total Financeiro',
    color: '#2563EB',
  },
  VARIACAO: {
    type: 'VARIACAO',
    label: 'Variação',
    color: '#F59E0B',
  },
  TAXA: {
    type: 'TAXA',
    label: 'Taxa',
    color: '#7C3AED',
  },
  VOLUME: {
    type: 'VOLUME',
    label: 'Volume',
    color: '#6B7280',
  },
}

const COLUMN_TYPE_PRIORITY = ['date', 'percent', 'monetary', 'status', 'category']
const STATUS_VALUES = new Set(['pago', 'pendente', 'cancelado', 'cancelada', 'ativo', 'inativo', 'sim', 'nao', 'não'])
const COLUMN_TYPE_KEYWORDS = {
  monetary: ['valor', 'valor_pago', 'preco', 'custo', 'total', 'amount', 'price', 'receita', 'despesa', 'gasto'],
  percent: ['%', 'percent', 'percentual', 'taxa', 'desconto', 'saving', 'economia'],
  date: ['data', 'date', 'vencimento', 'created_at', 'updated_at'],
  category: ['categoria', 'tipo', 'empresa', 'fornecedor', 'cliente', 'grupo'],
  status: ['status', 'situacao', 'state'],
}

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function parseNumericCell(value) {
  let str = String(value ?? '').trim().replace(/[R$€£¥%\s]/g, '')
  if (!str) return 0

  const commas = (str.match(/,/g) || []).length
  const dots = (str.match(/\./g) || []).length

  if (commas === 1 && /,\d{1,2}$/.test(str)) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0
  }
  if (dots === 1 && /\.\d{1,2}$/.test(str)) {
    return parseFloat(str.replace(/,/g, '')) || 0
  }
  if (dots > 1 && commas === 0) {
    return parseFloat(str.replace(/\./g, '')) || 0
  }

  return parseFloat(str.replace(',', '.')) || 0
}

function isDateValue(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return false
  if (/^\d{1,4}[\/-]\d{1,2}([\/-]\d{1,4})?/.test(raw)) return true
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed)
}

function getRowCell(row, index) {
  if (index < 0) return undefined
  if (Array.isArray(row?.cells)) return row.cells[index]
  if (Array.isArray(row)) return row[index]
  return row?.[index]
}

export function getColumnIndex(value, totalColumns = Infinity) {
  const index = parseInt(value, 10)
  return Number.isNaN(index) || index < 0 || index >= totalColumns ? -1 : index
}

function normalizeColumn(value, totalColumns) {
  const index = getColumnIndex(value, totalColumns)
  return index >= 0 ? String(index) : ''
}

function safeAverage(values = []) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function safeDivide(value, total) {
  return total ? value / total : 0
}

function parseDateBucket(rawValue) {
  const raw = String(rawValue ?? '').trim()
  if (!raw) return null
  let year = null
  let month = null
  let match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (match) {
    month = Number.parseInt(match[2], 10) - 1
    year = Number.parseInt(match[3], 10)
  }
  if (!match) {
    match = raw.match(/^(\d{1,2})[/-](\d{4})$/)
    if (match) {
      month = Number.parseInt(match[1], 10) - 1
      year = Number.parseInt(match[2], 10)
    }
  }
  if (!match) {
    match = raw.match(/^(\d{4})[/-](\d{1,2})/)
    if (match) {
      year = Number.parseInt(match[1], 10)
      month = Number.parseInt(match[2], 10) - 1
    }
  }
  if (month == null || month < 0 || month > 11) {
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return null
    year = parsed.getFullYear()
    month = parsed.getMonth()
  }
  if (!year || year < 1900) year = new Date().getFullYear()
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    year,
    month,
    label: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][month],
  }
}

function columnMatchesKeyword(name, keywords = []) {
  const normalized = normalizeText(name)
  return keywords.some(keyword => normalized.includes(normalizeText(keyword)))
}

export function detectColumnType(name, values = []) {
  const presentValues = values.filter(value => value !== '' && value != null)
  if (!presentValues.length) return 'category'

  const numericValues = presentValues.map(parseNumericCell).filter(value => Number.isFinite(value))
  const uniqueValues = [...new Set(presentValues.map(value => normalizeText(value)).filter(Boolean))]
  const uniqueRatio = safeDivide(uniqueValues.length, presentValues.length)
  const hasDecimals = numericValues.some(value => !Number.isInteger(value))
  const numericAverage = safeAverage(numericValues.map(value => Math.abs(value)))
  const inPercentRange = numericValues.filter(value => value >= 0 && value <= 100).length
  const dateMatches = presentValues.filter(isDateValue).length
  const statusMatches = uniqueValues.filter(value => STATUS_VALUES.has(value)).length

  const detectors = {
    date: () => columnMatchesKeyword(name, COLUMN_TYPE_KEYWORDS.date) || safeDivide(dateMatches, presentValues.length) > 0.6,
    percent: () => columnMatchesKeyword(name, COLUMN_TYPE_KEYWORDS.percent) || (numericValues.length > 0 && safeDivide(inPercentRange, numericValues.length) > 0.8),
    monetary: () => columnMatchesKeyword(name, COLUMN_TYPE_KEYWORDS.monetary) || (numericValues.length > 0 && numericAverage > 100 && hasDecimals),
    status: () => columnMatchesKeyword(name, COLUMN_TYPE_KEYWORDS.status) || (uniqueValues.length <= 10 && statusMatches > 0),
    category: () => columnMatchesKeyword(name, COLUMN_TYPE_KEYWORDS.category) || uniqueRatio <= 0.5,
  }

  return COLUMN_TYPE_PRIORITY.find(type => detectors[type]()) || 'category'
}

function normalizeMetricType(type) {
  return METRIC_TYPES[type] ? type : 'ECONOMIA'
}

export function normalizeSavingConfig(saving = {}, totalColumns = Infinity) {
  const legacyMode = saving.savingMode || ''
  let metricType = saving.metricType || saving.type || ''
  if (!metricType) {
    if (legacyMode === 'direct_value' || saving.savingCol) metricType = 'TOTAL'
    else if (legacyMode === 'original_minus_negotiated' || saving.originalCol || saving.v1Col || saving.negotiatedCol || saving.v2Col) metricType = 'ECONOMIA'
    else metricType = 'ECONOMIA'
  }
  metricType = normalizeMetricType(metricType)

  const metricMeta = METRIC_TYPES[metricType]
  const valueCol = normalizeColumn(saving.valueCol ?? saving.savingCol, totalColumns)
  const percentCol = normalizeColumn(saving.percentCol ?? saving.savingPercentCol ?? saving.percentualCol ?? saving.percentCol, totalColumns)
  const baseCol = normalizeColumn(saving.baseCol ?? saving.savingBaseCol ?? saving.valorBaseCol, totalColumns)
  const initialCol = normalizeColumn(saving.initialCol ?? saving.originalCol ?? saving.v1Col, totalColumns)
  const finalCol = normalizeColumn(saving.finalCol ?? saving.negotiatedCol ?? saving.v2Col, totalColumns)
  const categoryCol = normalizeColumn(saving.categoryCol ?? saving.groupCol, totalColumns)
  const entityCol = normalizeColumn(saving.entityCol ?? saving.labelCol, totalColumns)
  const dateCol = normalizeColumn(saving.dateCol, totalColumns)

  const derivedSavingMode =
    metricType === 'ECONOMIA'
      ? (percentCol && baseCol ? 'percent_x_base' : 'original_minus_negotiated')
      : metricType === 'TOTAL'
        ? 'direct_value'
        : ''

  return {
    ...saving,
    ...metricMeta,
    metricType,
    type: metricType,
    label: saving.label || metricMeta.label,
    color: saving.color || metricMeta.color,
    valueCol,
    percentCol,
    baseCol,
    initialCol,
    finalCol,
    categoryCol,
    entityCol,
    dateCol,
    valueLabel: saving.valueLabel || saving.directLabel || 'Valor',
    percentLabel: saving.percentLabel || saving.savingPercentLabel || 'Percentual',
    baseLabel: saving.baseLabel || saving.savingBaseLabel || 'Valor Base',
    initialLabel: saving.initialLabel || saving.originalLabel || saving.v1Label || 'Valor Inicial',
    finalLabel: saving.finalLabel || saving.negotiatedLabel || saving.v2Label || 'Valor Final',
    categoryLabel: saving.categoryLabel || 'Categoria',
    entityLabel: saving.entityLabel || 'Entidade',
    dateLabel: saving.dateLabel || 'Data',
    savingMode: saving.savingMode || derivedSavingMode,
    savingCol: metricType === 'TOTAL' ? valueCol : '',
    savingPercentCol: metricType === 'ECONOMIA' && percentCol && baseCol ? percentCol : '',
    savingBaseCol: metricType === 'ECONOMIA' && percentCol && baseCol ? baseCol : '',
    originalCol: metricType === 'ECONOMIA' && (!percentCol || !baseCol) ? initialCol : '',
    negotiatedCol: metricType === 'ECONOMIA' && (!percentCol || !baseCol) ? finalCol : '',
    v1Col: initialCol,
    v2Col: finalCol,
    savingPercentLabel: saving.percentLabel || saving.savingPercentLabel || 'Saving (%)',
    savingBaseLabel: saving.baseLabel || saving.savingBaseLabel || 'Valor Base',
    originalLabel: saving.initialLabel || saving.originalLabel || saving.v1Label || 'Valor Original',
    negotiatedLabel: saving.finalLabel || saving.negotiatedLabel || saving.v2Label || 'Valor Negociado',
    directLabel: saving.valueLabel || saving.directLabel || 'Valor',
  }
}

export function detectSavingColumnKind(rows = [], colIndex, columnName = '') {
  if (colIndex < 0) return 'unknown'
  const values = rows.map(row => getRowCell(row, colIndex))
  const detectedType = detectColumnType(columnName, values)
  if (detectedType === 'percent') return 'percentage'
  if (detectedType === 'monetary') return 'monetary'
  return 'unknown'
}

export function hasValidSavingConfig(saving = {}, totalColumns = Infinity) {
  const config = normalizeSavingConfig(saving, totalColumns)
  if (config.metricType === 'ECONOMIA') {
    const hasPercentFormula = getColumnIndex(config.percentCol, totalColumns) >= 0 && getColumnIndex(config.baseCol, totalColumns) >= 0
    const hasDeltaFormula = getColumnIndex(config.initialCol, totalColumns) >= 0 && getColumnIndex(config.finalCol, totalColumns) >= 0
    return hasPercentFormula || hasDeltaFormula
  }
  if (config.metricType === 'TOTAL') return getColumnIndex(config.valueCol, totalColumns) >= 0
  if (config.metricType === 'VARIACAO') {
    return getColumnIndex(config.initialCol, totalColumns) >= 0 && getColumnIndex(config.finalCol, totalColumns) >= 0
  }
  if (config.metricType === 'TAXA') return getColumnIndex(config.categoryCol, totalColumns) >= 0
  if (config.metricType === 'VOLUME') return true
  return false
}

function buildMetricRow(row, config, totalColumns) {
  const categoryIndex = getColumnIndex(config.categoryCol, totalColumns)
  const entityIndex = getColumnIndex(config.entityCol, totalColumns)
  const dateIndex = getColumnIndex(config.dateCol, totalColumns)
  const valueIndex = getColumnIndex(config.valueCol, totalColumns)
  const percentIndex = getColumnIndex(config.percentCol, totalColumns)
  const baseIndex = getColumnIndex(config.baseCol, totalColumns)
  const initialIndex = getColumnIndex(config.initialCol, totalColumns)
  const finalIndex = getColumnIndex(config.finalCol, totalColumns)

  const category = categoryIndex >= 0 ? String(getRowCell(row, categoryIndex) ?? '').trim() || '(vazio)' : '(sem categoria)'
  const entity = entityIndex >= 0 ? String(getRowCell(row, entityIndex) ?? '').trim() || '(vazio)' : category
  const rawDate = dateIndex >= 0 ? getRowCell(row, dateIndex) : null
  const dateBucket = parseDateBucket(rawDate)
  const value = valueIndex >= 0 ? parseNumericCell(getRowCell(row, valueIndex)) : 0
  const percent = percentIndex >= 0 ? parseNumericCell(getRowCell(row, percentIndex)) : 0
  const baseValue = baseIndex >= 0 ? parseNumericCell(getRowCell(row, baseIndex)) : 0
  const initialValue = initialIndex >= 0 ? parseNumericCell(getRowCell(row, initialIndex)) : 0
  const finalValue = finalIndex >= 0 ? parseNumericCell(getRowCell(row, finalIndex)) : 0

  let metricValue = 0
  let auxValue = null
  let formula = ''

  if (config.metricType === 'ECONOMIA') {
    if (percentIndex >= 0 && baseIndex >= 0) {
      metricValue = baseValue * (percent / 100)
      formula = 'percent_x_base'
      auxValue = percent
    } else {
      metricValue = initialValue - finalValue
      formula = 'original_minus_final'
      auxValue = finalValue
    }
  } else if (config.metricType === 'TOTAL') {
    metricValue = value
    formula = 'sum'
    auxValue = value
  } else if (config.metricType === 'VARIACAO') {
    metricValue = initialValue !== 0 ? ((finalValue - initialValue) / initialValue) * 100 : 0
    formula = 'variation_rate'
    auxValue = finalValue - initialValue
  } else if (config.metricType === 'TAXA') {
    metricValue = 1
    formula = 'category_share'
  } else if (config.metricType === 'VOLUME') {
    metricValue = 1
    formula = 'count'
  }

  return {
    row,
    category,
    entity,
    rawDate,
    dateKey: dateBucket?.key || '',
    dateLabel: dateBucket ? `${dateBucket.label}${dateBucket.year ? `/${dateBucket.year}` : ''}` : '',
    metricValue,
    auxValue,
    percentValue: percent,
    baseValue,
    initialValue,
    finalValue,
    formula,
  }
}

function groupMetricRows(metricRows, keySelector, reducer, limit = Infinity) {
  const groups = {}
  metricRows.forEach(item => {
    const key = keySelector(item)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  })
  const entries = Object.entries(groups)
    .map(([key, items]) => ({ key, value: reducer(items) }))
    .sort((left, right) => right.value - left.value)
    .slice(0, limit)
  return {
    labels: entries.map(entry => entry.key),
    data: entries.map(entry => Math.round(entry.value * 100) / 100),
  }
}

function sumMetricValues(items = []) {
  return items.reduce((sum, item) => sum + (item.metricValue || 0), 0)
}

function buildMetricCharts(metricRows, config) {
  const byCategorySum = groupMetricRows(metricRows, item => item.category, sumMetricValues, 12)
  const byEntitySum = groupMetricRows(metricRows, item => item.entity, sumMetricValues, 10)
  const byDateSum = groupMetricRows(metricRows.filter(item => item.dateKey), item => item.dateLabel, sumMetricValues, Infinity)

  if (config.metricType === 'TAXA') {
    const counts = groupMetricRows(metricRows, item => item.category, items => items.length, 12)
    const total = counts.data.reduce((sum, value) => sum + value, 0)
    const rates = counts.data.map(value => Math.round(safeDivide(value, total) * 10000) / 100)
    return [
      { id: 'metric-1', type: 'pie', title: 'Proporção por categoria', labels: counts.labels, data: rates, isPercent: true },
      { id: 'metric-2', type: 'bar', title: 'Taxa por categoria', labels: counts.labels, data: rates, isPercent: true },
      { id: 'metric-3', type: 'hbar', title: 'Ranking por categoria', labels: counts.labels, data: rates, isPercent: true },
      { id: 'metric-4', type: 'line', title: 'Evolução temporal', labels: byDateSum.labels, d1: byDateSum.data, isPercent: false },
    ]
  }

  if (config.metricType === 'VOLUME') {
    const counts = groupMetricRows(metricRows, item => item.category, items => items.length, 12)
    const byEntityCount = groupMetricRows(metricRows, item => item.entity, items => items.length, 10)
    const byDateCount = groupMetricRows(metricRows.filter(item => item.dateKey), item => item.dateLabel, items => items.length, Infinity)
    return [
      { id: 'metric-1', type: 'bar', title: 'Contagem por categoria', labels: counts.labels, data: counts.data },
      { id: 'metric-2', type: 'pie', title: 'Distribuição', labels: counts.labels, data: counts.data },
      { id: 'metric-3', type: 'hbar', title: 'Ranking', labels: byEntityCount.labels, data: byEntityCount.data },
      { id: 'metric-4', type: 'line', title: 'Evolução temporal', labels: byDateCount.labels, d1: byDateCount.data },
    ]
  }

  if (config.metricType === 'VARIACAO') {
    const histogramBuckets = {}
    metricRows.forEach(item => {
      const bucket = `${Math.floor(item.metricValue / 10) * 10}%`
      histogramBuckets[bucket] = (histogramBuckets[bucket] || 0) + 1
    })
    const histogram = Object.entries(histogramBuckets).sort((a, b) => a[0].localeCompare(b[0]))
    const outliers = [...metricRows]
      .sort((left, right) => Math.abs(right.metricValue) - Math.abs(left.metricValue))
      .slice(0, 10)
    return [
      { id: 'metric-1', type: 'bar', title: 'Média por categoria', ...groupMetricRows(metricRows, item => item.category, items => safeAverage(items.map(entry => entry.metricValue)), 12), isPercent: true },
      { id: 'metric-2', type: 'bar', title: 'Distribuição', labels: histogram.map(([label]) => label), data: histogram.map(([, value]) => value) },
      { id: 'metric-3', type: 'hbar', title: 'Outliers', labels: outliers.map(item => item.entity), data: outliers.map(item => Math.round(item.metricValue * 100) / 100), isPercent: true },
      { id: 'metric-4', type: 'line', title: 'Evolução', labels: byDateSum.labels, d1: byDateSum.data, isPercent: true },
    ]
  }

  const titles = config.metricType === 'TOTAL'
    ? ['Total por categoria', 'Distribuição', 'Top valores', 'Evolução temporal']
    : ['Economia por categoria', 'Distribuição', 'Ranking', 'Evolução']

  return [
    { id: 'metric-1', type: 'bar', title: titles[0], labels: byCategorySum.labels, data: byCategorySum.data, isCurrency: true },
    { id: 'metric-2', type: 'pie', title: titles[1], labels: byCategorySum.labels, data: byCategorySum.data, isCurrency: true },
    { id: 'metric-3', type: 'hbar', title: titles[2], labels: byEntitySum.labels, data: byEntitySum.data, isCurrency: true },
    { id: 'metric-4', type: 'line', title: titles[3], labels: byDateSum.labels, d1: byDateSum.data, isCurrency: true },
  ]
}

function buildMetricInsights(metricRows, config, summary) {
  if (!metricRows.length) {
    return [{
      tipo: 'operacional',
      severidade: 'alta',
      titulo: 'Dataset vazio ou insuficiente',
      descricao: 'A métrica selecionada não possui dados válidos para cálculo.',
    }]
  }

  const topCategory = groupMetricRows(metricRows, item => item.category, sumMetricValues, 1)
  const insights = [{
    tipo: 'operacional',
    severidade: 'media',
    titulo: `${config.label} consolidada`,
    descricao: `Valor total apurado: ${summary.total.toFixed(2)} em ${metricRows.length} registros válidos.`,
  }]

  if (topCategory.labels.length) {
    insights.push({
      tipo: 'financeiro',
      severidade: 'baixa',
      titulo: 'Maior concentração por categoria',
      descricao: `${topCategory.labels[0]} lidera a métrica com ${topCategory.data[0].toFixed(2)}.`,
    })
  }

  return insights
}

export function buildMetricDataset(rows = [], saving = {}, totalColumns = Infinity) {
  const config = normalizeSavingConfig(saving, totalColumns)
  const isValid = hasValidSavingConfig(config, totalColumns)
  if (!isValid) {
    return {
      config,
      valid: false,
      error: 'As colunas selecionadas não são compatíveis com a métrica.',
      rows: [],
      total: 0,
      detailItems: [],
      chartConfig: [],
      insights: [],
    }
  }

  let metricRows = rows.map(row => buildMetricRow(row, config, totalColumns))

  if (config.metricType === 'TAXA') {
    const counts = groupMetricRows(metricRows, item => item.category, items => items.length, Infinity)
    const total = counts.data.reduce((sum, value) => sum + value, 0)
    metricRows = counts.labels.map((label, index) => ({
      category: label,
      entity: label,
      dateKey: '',
      dateLabel: '',
      metricValue: Math.round(safeDivide(counts.data[index], total) * 10000) / 100,
    }))
  }

  const total =
    config.metricType === 'TAXA'
      ? 100
      : config.metricType === 'VOLUME'
        ? metricRows.length
        : sumMetricValues(metricRows)

  const summary = {
    config,
    valid: true,
    rows: metricRows,
    values: metricRows.map(item => item.metricValue),
    total,
    originalTotal: metricRows.reduce((sum, item) => sum + item.initialValue, 0),
    negotiatedTotal: metricRows.reduce((sum, item) => sum + item.finalValue, 0),
    baseTotal: metricRows.reduce((sum, item) => sum + item.baseValue, 0),
    averagePercent: safeAverage(metricRows.map(item => item.percentValue).filter(value => Number.isFinite(value) && value !== 0)),
  }

  summary.detailItems = getSavingDetailItems(summary)
  summary.chartConfig = buildMetricCharts(metricRows, config)
  summary.insights = buildMetricInsights(metricRows, config, summary)
  return summary
}

export function calculateSavingValue(row, saving = {}, totalColumns = Infinity) {
  return buildMetricRow(row, normalizeSavingConfig(saving, totalColumns), totalColumns).metricValue
}

export function summarizeSaving(rows = [], saving = {}, totalColumns = Infinity) {
  return buildMetricDataset(rows, saving, totalColumns)
}

export function getSavingDetailItems(summary) {
  const { config } = summary
  if (config.metricType === 'ECONOMIA') {
    if (config.percentCol && config.baseCol) {
      return [
        { kind: 'currency', label: config.baseLabel, value: summary.baseTotal },
        { kind: 'percent', label: config.percentLabel, value: summary.averagePercent, accent: true },
      ]
    }
    return [
      { kind: 'currency', label: config.initialLabel, value: summary.originalTotal },
      { kind: 'currency', label: config.finalLabel, value: summary.negotiatedTotal, accent: true },
    ]
  }
  if (config.metricType === 'TOTAL') {
    return [{ kind: 'currency', label: config.valueLabel, value: summary.total }]
  }
  if (config.metricType === 'VARIACAO') {
    return [
      { kind: 'currency', label: config.initialLabel, value: summary.originalTotal },
      { kind: 'currency', label: config.finalLabel, value: summary.negotiatedTotal, accent: true },
    ]
  }
  if (config.metricType === 'TAXA') {
    return [{ kind: 'percent', label: config.label, value: summary.total }]
  }
  return [{ kind: 'number', label: config.label, value: summary.total }]
}

export function groupSavingBy(rows = [], groupIndex, saving = {}, totalColumns = Infinity, limit = 8) {
  const dataset = buildMetricDataset(rows, { ...saving, categoryCol: String(groupIndex) }, totalColumns)
  const grouped = groupMetricRows(dataset.rows, item => item.category, sumMetricValues, limit)
  return { cats: grouped.labels, vals: grouped.data }
}

export function getMetricTypeDefinition(type) {
  return METRIC_TYPES[normalizeMetricType(type)]
}

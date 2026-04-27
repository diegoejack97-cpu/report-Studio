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

function isDateValue(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return false
  if (/^\d{1,4}[\/-]\d{1,2}([\/-]\d{1,4})?/.test(raw)) return true
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed)
}

function isNumericValue(value) {
  let raw = String(value ?? '').trim()
  if (!raw) return false
  raw = raw
    .replace(/(R\$|US\$|BRL|USD|EUR|GBP|JPY)/gi, '')
    .replace(/[$€£¥%\s\u00a0]/g, '')
  if (!raw || /[^0-9,.\-+]/.test(raw) || /[+-]/.test(raw.slice(1))) return false
  if (/^[+-]/.test(raw)) raw = raw.slice(1)
  if (!raw) return false
  if (raw.includes(',')) {
    if ((raw.match(/,/g) || []).length > 1) return false
    const [integerPart, decimalPart = ''] = raw.split(',')
    if (decimalPart.includes('.') || !/^\d*$/.test(decimalPart)) return false
    if (integerPart.includes('.')) {
      const groups = integerPart.split('.')
      if (!groups[0] || groups[0].length > 3 || groups.slice(1).some(group => group.length !== 3)) return false
    } else if (!/^\d+$/.test(integerPart)) {
      return false
    }
    return true
  }
  return (raw.match(/\./g) || []).length <= 1 && /^\d+(\.\d+)?$/.test(raw)
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

function columnMatchesKeyword(name, keywords = []) {
  const normalized = normalizeText(name)
  return keywords.some(keyword => normalized.includes(normalizeText(keyword)))
}

export function detectColumnType(name, values = []) {
  const presentValues = values.filter(value => value !== '' && value != null)
  if (!presentValues.length) return 'category'

  const normalizedValues = presentValues.map(value => String(value).trim())
  const uniqueValues = [...new Set(normalizedValues.map(value => normalizeText(value)).filter(Boolean))]
  const uniqueRatio = uniqueValues.length / presentValues.length
  const numericPatternCount = normalizedValues.filter(isNumericValue).length
  const percentPatternCount = normalizedValues.filter(value => /%$/.test(value) || /percent|taxa|economia|saving/i.test(value)).length
  const dateMatches = presentValues.filter(isDateValue).length
  const statusMatches = uniqueValues.filter(value => STATUS_VALUES.has(value)).length

  const detectors = {
    date: () => columnMatchesKeyword(name, COLUMN_TYPE_KEYWORDS.date) || dateMatches / presentValues.length > 0.6,
    percent: () => columnMatchesKeyword(name, COLUMN_TYPE_KEYWORDS.percent) || percentPatternCount / presentValues.length > 0.5,
    monetary: () => columnMatchesKeyword(name, COLUMN_TYPE_KEYWORDS.monetary) || numericPatternCount / presentValues.length > 0.6,
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

export function getMetricTypeDefinition(type) {
  return METRIC_TYPES[normalizeMetricType(type)]
}

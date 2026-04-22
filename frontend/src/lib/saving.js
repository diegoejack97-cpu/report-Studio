const VALID_SAVING_MODES = new Set([
  'original_minus_negotiated',
  'direct_value',
  'percent_x_base',
])

export function parseNumericCell(value) {
  let str = String(value ?? '').trim().replace(/[R$€£¥\s]/g, '')
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

export function getColumnIndex(value, totalColumns = Infinity) {
  const index = parseInt(value, 10)
  return Number.isNaN(index) || index < 0 || index >= totalColumns ? -1 : index
}

function getRowCell(row, index) {
  if (index < 0) return undefined
  if (Array.isArray(row?.cells)) return row.cells[index]
  if (Array.isArray(row)) return row[index]
  return row?.[index]
}

function normalizeColumn(value, totalColumns) {
  const index = getColumnIndex(value, totalColumns)
  return index >= 0 ? String(index) : ''
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function hasPercentHint(columnName = '') {
  return /%|percent|percentual|pct|saving\s*\(?%\)?/i.test(String(columnName))
}

export function normalizeSavingConfig(saving = {}, totalColumns = Infinity) {
  const originalCol = normalizeColumn(saving.originalCol ?? saving.v1Col, totalColumns)
  const negotiatedCol = normalizeColumn(saving.negotiatedCol ?? saving.v2Col, totalColumns)
  const savingCol = normalizeColumn(saving.savingCol, totalColumns)
  const savingPercentCol = normalizeColumn(
    saving.savingPercentCol
    ?? saving.percentualCol
    ?? saving.percentCol
    ?? ((saving.savingMode === 'percent_x_base' || saving.savingType === 'percentage') ? saving.savingCol : ''),
    totalColumns,
  )
  const savingBaseCol = normalizeColumn(saving.savingBaseCol ?? saving.valorBaseCol ?? saving.baseCol, totalColumns)

  let savingMode = VALID_SAVING_MODES.has(saving.savingMode) ? saving.savingMode : ''
  if (!savingMode) {
    if (savingPercentCol && savingBaseCol) savingMode = 'percent_x_base'
    else if (savingCol) savingMode = 'direct_value'
    else if (originalCol || negotiatedCol) savingMode = 'original_minus_negotiated'
  }

  return {
    ...saving,
    label: saving.label || 'Saving Total (R$)',
    savingMode,
    savingCol,
    savingPercentCol,
    savingBaseCol,
    originalCol,
    negotiatedCol,
    v1Col: originalCol,
    v2Col: negotiatedCol,
    originalLabel: saving.originalLabel ?? saving.v1Label ?? 'Valor Original',
    negotiatedLabel: saving.negotiatedLabel ?? saving.v2Label ?? 'Valor Negociado',
    savingBaseLabel: saving.savingBaseLabel ?? saving.valorBaseLabel ?? saving.baseLabel ?? 'Valor Base',
    savingPercentLabel: saving.savingPercentLabel ?? saving.percentualLabel ?? saving.percentLabel ?? 'Saving (%)',
    directLabel: saving.directLabel ?? 'Saving Direto',
  }
}

export function detectSavingColumnKind(rows = [], colIndex, columnName = '') {
  if (colIndex < 0) return 'unknown'

  const numericValues = rows
    .map(row => getRowCell(row, colIndex))
    .filter(value => value !== '' && value != null)
    .map(value => parseNumericCell(value))
    .filter(value => Number.isFinite(value))

  if (!numericValues.length) return 'unknown'

  const percentRangeCount = numericValues.filter(value => value >= 0 && value <= 100).length
  const ratioInPercentRange = percentRangeCount / numericValues.length
  const maxValue = Math.max(...numericValues)

  if (hasPercentHint(columnName) || (ratioInPercentRange >= 0.8 && maxValue <= 100)) {
    return 'percentage'
  }

  return 'monetary'
}

export function hasValidSavingConfig(saving = {}, totalColumns = Infinity) {
  const config = normalizeSavingConfig(saving, totalColumns)

  if (config.savingMode === 'direct_value') return getColumnIndex(config.savingCol, totalColumns) >= 0
  if (config.savingMode === 'percent_x_base') {
    return (
      getColumnIndex(config.savingPercentCol, totalColumns) >= 0 &&
      getColumnIndex(config.savingBaseCol, totalColumns) >= 0
    )
  }
  if (config.savingMode === 'original_minus_negotiated') {
    return (
      getColumnIndex(config.originalCol, totalColumns) >= 0 ||
      getColumnIndex(config.negotiatedCol, totalColumns) >= 0
    )
  }

  return false
}

/**
 * Saving calculation modes:
 * - original_minus_negotiated => original - negotiated
 * - direct_value => sum of a direct monetary saving column
 * - percent_x_base => base * percent / 100 for each row
 */
export function calculateSavingValue(row, saving = {}, totalColumns = Infinity) {
  const config = normalizeSavingConfig(saving, totalColumns)
  const originalIndex = getColumnIndex(config.originalCol, totalColumns)
  const negotiatedIndex = getColumnIndex(config.negotiatedCol, totalColumns)
  const directIndex = getColumnIndex(config.savingCol, totalColumns)
  const percentIndex = getColumnIndex(config.savingPercentCol, totalColumns)
  const baseIndex = getColumnIndex(config.savingBaseCol, totalColumns)

  if (config.savingMode === 'original_minus_negotiated') {
    const originalValue = parseNumericCell(getRowCell(row, originalIndex))
    const negotiatedValue = parseNumericCell(getRowCell(row, negotiatedIndex))
    return originalValue - negotiatedValue
  }

  if (config.savingMode === 'direct_value') {
    return parseNumericCell(getRowCell(row, directIndex))
  }

  if (config.savingMode === 'percent_x_base') {
    const baseValue = parseNumericCell(getRowCell(row, baseIndex))
    const percentValue = parseNumericCell(getRowCell(row, percentIndex))
    return (baseValue * percentValue) / 100
  }

  return 0
}

export function sumColumnValues(rows = [], colIndex) {
  if (colIndex < 0) return 0
  return rows.reduce((sum, row) => sum + parseNumericCell(getRowCell(row, colIndex)), 0)
}

/**
 * Saving calculation modes:
 * - original_minus_negotiated keeps the legacy original/negotiated comparison
 * - direct_value aggregates the mapped monetary saving column
 * - percent_x_base always converts the percent column into BRL before summing
 */
export function summarizeSaving(rows = [], saving = {}, totalColumns = Infinity) {
  const config = normalizeSavingConfig(saving, totalColumns)
  const savingValues = rows.map(row => calculateSavingValue(row, config, totalColumns))
  const total = savingValues.reduce((sum, value) => sum + value, 0)
  const originalIndex = getColumnIndex(config.originalCol, totalColumns)
  const negotiatedIndex = getColumnIndex(config.negotiatedCol, totalColumns)
  const percentIndex = getColumnIndex(config.savingPercentCol, totalColumns)
  const baseIndex = getColumnIndex(config.savingBaseCol, totalColumns)
  const percentValues = percentIndex < 0
    ? []
    : rows
        .map(row => getRowCell(row, percentIndex))
        .filter(value => value !== '' && value != null)
        .map(value => parseNumericCell(value))

  return {
    config,
    values: savingValues,
    total,
    originalTotal: sumColumnValues(rows, originalIndex),
    negotiatedTotal: sumColumnValues(rows, negotiatedIndex),
    baseTotal: sumColumnValues(rows, baseIndex),
    averagePercent: average(percentValues),
  }
}

export function getSavingDetailItems(summary) {
  const { config, originalTotal, negotiatedTotal, baseTotal, averagePercent } = summary
  const items = []

  if (config.originalCol !== '') {
    items.push({ kind: 'currency', label: config.originalLabel, value: originalTotal })
  }
  if (config.negotiatedCol !== '') {
    items.push({ kind: 'currency', label: config.negotiatedLabel, value: negotiatedTotal, accent: true })
  }

  if (!items.length && config.savingMode === 'percent_x_base') {
    if (config.savingBaseCol !== '') {
      items.push({ kind: 'currency', label: config.savingBaseLabel, value: baseTotal })
    }
    if (config.savingPercentCol !== '') {
      items.push({ kind: 'percent', label: config.savingPercentLabel, value: averagePercent, accent: true })
    }
  }

  return items
}

/**
 * Saving calculation modes:
 * - original_minus_negotiated groups row-by-row differences
 * - direct_value groups direct monetary saving values
 * - percent_x_base groups converted BRL values, never raw percentages
 */
export function groupSavingBy(rows = [], groupIndex, saving = {}, totalColumns = Infinity, limit = 8) {
  if (groupIndex < 0) return { cats: [], vals: [] }

  const config = normalizeSavingConfig(saving, totalColumns)
  if (!hasValidSavingConfig(config, totalColumns)) return { cats: [], vals: [] }

  const grouped = {}
  rows.forEach(row => {
    const key = String(getRowCell(row, groupIndex) ?? '').trim() || '(vazio)'
    grouped[key] = (grouped[key] || 0) + calculateSavingValue(row, config, totalColumns)
  })

  const sorted = Object.entries(grouped)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)

  return {
    cats: sorted.map(([key]) => key),
    vals: sorted.map(([, value]) => Math.round(value * 100) / 100),
  }
}

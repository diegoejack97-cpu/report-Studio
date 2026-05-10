const IDENTIFIER_RE = /(contrato|c[oó]digo|codigo|\bid\b|n[uú]mero|numero|processo|protocolo|ap[oó]lice|apolice|cpf|cnpj|matr[ií]cula|matricula|pedido|ordem|\bscd\b|\bssj\b)/i
const MONEY_RE = /(valor|price|pre[cç]o|custo|amount|receita|despesa|gasto|money|currency|total|base|pago|negociado)/i
const STRONG_MONEY_RE = /(valor\s+(anual|mensal|corrigido|reajustado)|valor|receita|custo|total|pre[cç]o|despesa|gasto|mensal\s+(atual|corrigido|reajustado)|anual\s+(atual|corrigido|reajustado))/i
const PERCENT_RE = /(percent|percentual|pct|taxa|desconto|saving|economia|%)/i
const DATE_RE = /(data|date|venc|m[eê]s|ano|period)/i
const CATEGORY_RE = /(categoria|category|tipo|fornecedor|empresa|cliente|grupo|setor|status|situacao|situação|area|área|departamento|unidade|segmento)/i
const SAVING_RE = /(saving|economia|desconto)/i
const COMPARE_RE = /(inicial|original|final|negociado|atual|reajustado|corrigido|anterior|novo)/i
const CURRENCY_RE = /(r\$|us\$|brl|usd|eur|gbp|jpy|[$€£¥])/i
const SUMMARY_RE = /(indicador|indicator|m[eé]trica|metric|resumo|summary|coment[aá]rio|comment|observa[cç][aã]o|nota|descri[cç][aã]o)/i

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function isFilled(value) {
  return value !== '' && value != null
}

function parseNumericLike(value) {
  if (value == null || typeof value === 'boolean') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let text = String(value).trim()
  if (!text) return null
  text = text
    .replace(/(r\$|us\$|brl|usd|eur|gbp|jpy)/gi, '')
    .replace(/[$€£¥%\s\u00a0]/g, '')
  if (!text || /[^0-9,.\-+]/.test(text)) return null
  if (/[+-]/.test(text.slice(1))) return null

  if (text.includes(',') && text.includes('.')) {
    const decimalSeparator = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.'
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ','
    const normalized = text
      .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
      .replace(decimalSeparator, '.')
    if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null
    const numeric = Number(normalized)
    return Number.isFinite(numeric) ? numeric : null
  }

  if (text.includes(',')) {
    const [integerPart, decimalPart = ''] = text.split(',')
    if (text.split(',').length > 2 || decimalPart.includes('.')) {
      const normalized = text.replace(/,/g, '')
      if (!/^[+-]?\d+$/.test(normalized)) return null
      const numeric = Number(normalized)
      return Number.isFinite(numeric) ? numeric : null
    }
    const normalizedInteger = integerPart.replace(/\./g, '')
    if (!/^[+-]?\d+$/.test(normalizedInteger) || !/^\d*$/.test(decimalPart)) return null
    const numeric = Number(`${normalizedInteger}.${decimalPart || '0'}`)
    return Number.isFinite(numeric) ? numeric : null
  }

  if ((text.match(/\./g) || []).length > 1) return null
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null
  const numeric = Number(text)
  return Number.isFinite(numeric) ? numeric : null
}

function looksLikeDate(value) {
  const text = String(value || '').trim()
  if (!text) return false
  if (/^\d{1,4}[/-]\d{1,2}([/-]\d{1,4})?$/.test(text)) return true
  const parsed = Date.parse(text)
  return Number.isFinite(parsed)
}

function getColumnValues(rows, columnIndex) {
  return rows
    .map(row => row?.[columnIndex])
    .filter(isFilled)
}

function getComparableRole(normalizedName) {
  if (/(inicial|original|atual|anterior|\bbase\b)/i.test(normalizedName)) return 'base'
  if (/(final|negociado|reajustado|corrigido|novo)/i.test(normalizedName)) return 'final'
  return ''
}

function getFinancialDimension(normalizedName) {
  if (/mensal|m[eê]s/.test(normalizedName)) return 'mensal'
  if (/anual|ano/.test(normalizedName)) return 'anual'
  if (/valor/.test(normalizedName)) return 'valor'
  return ''
}

function analyzeColumn(name, values) {
  const normalizedName = normalizeText(name)
  const filledValues = values.filter(isFilled)
  const sample = filledValues.slice(0, 25)
  const numericValues = sample.map(parseNumericLike).filter(value => value != null)
  const allNumericValues = filledValues.map(parseNumericLike).filter(value => value != null)
  const numericRate = sample.length ? numericValues.length / sample.length : 0
  const allNumericRate = filledValues.length ? allNumericValues.length / filledValues.length : 0
  const dateRate = sample.length ? sample.filter(looksLikeDate).length / sample.length : 0
  const currencyRate = sample.length ? sample.filter(value => CURRENCY_RE.test(String(value || ''))).length / sample.length : 0
  const allCurrencyRate = filledValues.length ? filledValues.filter(value => CURRENCY_RE.test(String(value || ''))).length / filledValues.length : 0
  const uniqueCount = new Set(filledValues.map(value => normalizeText(value))).size
  const uniqueRatio = filledValues.length ? uniqueCount / filledValues.length : 1

  const identifierName = IDENTIFIER_RE.test(normalizedName)
  const moneyName = MONEY_RE.test(normalizedName)
  const strongMoneyName = STRONG_MONEY_RE.test(normalizedName)
  const percentName = PERCENT_RE.test(normalizedName)
  const dateName = DATE_RE.test(normalizedName)
  const categoryName = CATEGORY_RE.test(normalizedName)
  const savingName = SAVING_RE.test(normalizedName)
  const comparableName = COMPARE_RE.test(normalizedName)
  const summaryName = SUMMARY_RE.test(normalizedName)
  const identifier = identifierName && !moneyName
  const hasSomeNumericValues = allNumericValues.length >= 2 || (filledValues.length > 0 && allNumericRate >= 0.4)
  const sparseStrongMonetary = strongMoneyName && hasSomeNumericValues
  const formattedMonetary = (currencyRate >= 0.25 || allCurrencyRate >= 0.25) && hasSomeNumericValues
  const monetary = !identifier && (
    ((moneyName || formattedMonetary) && (numericRate >= 0.4 || allNumericRate >= 0.4)) ||
    sparseStrongMonetary
  )
  const percent = percentName && (numericRate >= 0.4 || allNumericRate >= 0.4)
  const date = dateName || dateRate >= 0.55
  const category = categoryName || (filledValues.length >= 2 && uniqueRatio <= 0.55)
  const comparableRole = getComparableRole(normalizedName)
  const financialDimension = getFinancialDimension(normalizedName)

  return {
    name,
    filledCount: filledValues.length,
    numericCount: allNumericValues.length,
    numericRate,
    allNumericRate,
    dateRate,
    uniqueCount,
    uniqueRatio,
    identifier,
    monetary,
    sparseStrongMonetary,
    percent,
    date,
    category,
    savingName,
    comparableName,
    comparableRole,
    financialDimension,
    summaryName,
  }
}

function hasComparableFinancialPair(columns) {
  const monetaryColumns = columns.filter(column => column.monetary)
  return monetaryColumns.some((left, leftIndex) => (
    monetaryColumns.slice(leftIndex + 1).some(right => {
      const leftRole = left.comparableRole || (right.comparableRole === 'final' && left.financialDimension ? 'base' : '')
      const rightRole = right.comparableRole || (left.comparableRole === 'base' && right.financialDimension ? 'final' : '')
      const hasBaseAndFinal = new Set([leftRole, rightRole]).has('base') && new Set([leftRole, rightRole]).has('final')
      if (!hasBaseAndFinal) return false

      const leftDimension = left.financialDimension || right.financialDimension
      const rightDimension = right.financialDimension || left.financialDimension
      return !leftDimension || !rightDimension || leftDimension === rightDimension
    })
  ))
}

function hasEconomiaPair(columns) {
  const monetaryColumns = columns.filter(column => column.monetary)
  return monetaryColumns.some((left, leftIndex) => (
    monetaryColumns.slice(leftIndex + 1).some(right => {
      const names = `${normalizeText(left.name)} ${normalizeText(right.name)}`
      const hasOriginalOrBase = /(original|\bbase\b)/.test(names)
      const hasFinalOrNegotiated = /(final|negociado)/.test(names)
      const hasAdjustmentOnly = /(reajust|corrigid|ipca|acr[eé]scimo|acrescimo)/.test(names)
      return hasOriginalOrBase && hasFinalOrNegotiated && !hasAdjustmentOnly
    })
  ))
}

function buildRecommendedMetrics(kind, signals) {
  if (kind === 'empty') return []

  const metrics = []
  if (signals.monetaryColumns > 0) metrics.push('TOTAL')

  const hasEconomiaShape =
    signals.savingPercentColumns > 0 ||
    signals.savingColumns > 0 ||
    signals.economiaComparablePairs > 0
  if (hasEconomiaShape) metrics.push('ECONOMIA')

  if (signals.comparableFinancialPairs > 0) {
    metrics.push('VARIACAO')
  }

  if (kind !== 'financial' || metrics.length === 0) metrics.push('VOLUME')
  if (signals.categoryColumns > 0) metrics.push('TAXA')

  return [...new Set(metrics)]
}

function classifySheet({ rowCount, colCount, density, signals }) {
  if (rowCount <= 0 || colCount <= 0 || density < 0.05) return 'empty'
  if (rowCount <= 8 && colCount <= 8) {
    const compactManualSummary =
      signals.summaryColumns > 0 &&
      signals.monetaryColumns <= 1 &&
      signals.percentColumns === 0 &&
      signals.comparableFinancialColumns < 2
    if (signals.monetaryColumns === 0 || compactManualSummary) return 'summary'
  }
  if (signals.monetaryColumns > 0 && signals.operationalSignals >= 2) return 'mixed'
  if (signals.monetaryColumns > 0) return 'financial'
  return 'operational'
}

function scoreSheet(kind, { rowCount, colCount, density, signals }) {
  if (kind === 'empty') return 0
  let score = 20
  score += Math.min(rowCount, 100) * 0.25
  score += Math.min(colCount, 20)
  score += Math.round(density * 25)
  score += signals.monetaryColumns * 8
  score += signals.categoryColumns * 4
  score += signals.dateColumns * 4
  score += signals.identifierColumns * 2
  if (kind === 'summary') score -= 12
  return Math.max(0, Math.min(100, Math.round(score)))
}

function buildWarnings(kind, signals, density) {
  const warnings = []
  if (kind === 'empty') warnings.push('Aba vazia ou quase vazia.')
  if (kind !== 'empty' && density < 0.25) warnings.push('Baixa densidade de preenchimento; confira se a região de dados foi detectada corretamente.')
  if (signals.sparseFinancialColumns > 0) warnings.push('Coluna financeira esparsa detectada; confira a seleção antes de gerar métricas financeiras.')
  if (signals.identifierColumns > 0) warnings.push('Colunas identificadoras foram reconhecidas e não serão sugeridas como valores financeiros.')
  if (kind === 'operational') warnings.push('Nenhuma coluna monetária real foi detectada nesta aba.')
  return warnings
}

export function analyzeWorkbookSheet(sheet) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : Array.isArray(sheet.sampleRows) ? sheet.sampleRows : []
  const cols = Array.isArray(sheet.cols) ? sheet.cols : []
  const rowCount = Number(sheet.rowCount ?? rows.length) || 0
  const colCount = Number(sheet.colCount ?? cols.length) || 0
  const sampleCellCount = rows.length * Math.max(colCount, 1)
  const filledCells = rows.reduce((count, row) => (
    count + cols.reduce((inner, _, index) => inner + (isFilled(row?.[index]) ? 1 : 0), 0)
  ), 0)
  const density = sampleCellCount ? filledCells / sampleCellCount : 0
  const columns = cols.map((name, index) => analyzeColumn(name, getColumnValues(rows, index)))

  const signals = {
    monetaryColumns: columns.filter(column => column.monetary).length,
    percentColumns: columns.filter(column => column.percent).length,
    categoryColumns: columns.filter(column => column.category).length,
    dateColumns: columns.filter(column => column.date).length,
    identifierColumns: columns.filter(column => column.identifier).length,
    savingColumns: columns.filter(column => column.savingName && (column.monetary || column.percent || column.numericRate >= 0.4)).length,
    savingPercentColumns: columns.filter(column => column.savingName && column.percent).length,
    comparableFinancialColumns: columns.filter(column => column.monetary && column.comparableName).length,
    comparableFinancialPairs: hasComparableFinancialPair(columns) ? 1 : 0,
    economiaComparablePairs: hasEconomiaPair(columns) ? 1 : 0,
    sparseFinancialColumns: columns.filter(column => column.monetary && column.filledCount > 0 && column.filledCount / Math.max(rowCount, 1) < 0.2).length,
    summaryColumns: columns.filter(column => column.summaryName).length,
  }
  signals.operationalSignals = signals.categoryColumns + signals.dateColumns + signals.identifierColumns

  const detectedKind = classifySheet({ rowCount, colCount, density, signals })
  const score = scoreSheet(detectedKind, { rowCount, colCount, density, signals })

  return {
    detectedKind,
    score,
    recommendedMetrics: buildRecommendedMetrics(detectedKind, signals),
    warnings: buildWarnings(detectedKind, signals, density),
    analysis: {
      density: Number(density.toFixed(2)),
      signals,
    },
  }
}

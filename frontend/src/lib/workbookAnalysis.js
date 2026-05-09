const IDENTIFIER_RE = /(contrato|c[oó]digo|codigo|\bid\b|n[uú]mero|numero|processo|protocolo|ap[oó]lice|apolice|cpf|cnpj|matr[ií]cula|matricula|pedido|ordem|\bscd\b|\bssj\b)/i
const MONEY_RE = /(valor|price|pre[cç]o|custo|amount|receita|despesa|gasto|money|currency|total|base|pago|negociado)/i
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

  if (text.includes(',')) {
    const [integerPart, decimalPart = ''] = text.split(',')
    if (text.split(',').length > 2 || decimalPart.includes('.')) return null
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

function analyzeColumn(name, values) {
  const normalizedName = normalizeText(name)
  const filledValues = values.filter(isFilled)
  const sample = filledValues.slice(0, 25)
  const numericValues = sample.map(parseNumericLike).filter(value => value != null)
  const numericRate = sample.length ? numericValues.length / sample.length : 0
  const dateRate = sample.length ? sample.filter(looksLikeDate).length / sample.length : 0
  const currencyRate = sample.length ? sample.filter(value => CURRENCY_RE.test(String(value || ''))).length / sample.length : 0
  const uniqueCount = new Set(filledValues.map(value => normalizeText(value))).size
  const uniqueRatio = filledValues.length ? uniqueCount / filledValues.length : 1

  const identifierName = IDENTIFIER_RE.test(normalizedName)
  const moneyName = MONEY_RE.test(normalizedName)
  const percentName = PERCENT_RE.test(normalizedName)
  const dateName = DATE_RE.test(normalizedName)
  const categoryName = CATEGORY_RE.test(normalizedName)
  const savingName = SAVING_RE.test(normalizedName)
  const comparableName = COMPARE_RE.test(normalizedName)
  const summaryName = SUMMARY_RE.test(normalizedName)
  const identifier = identifierName && !moneyName
  const monetary = !identifier && (moneyName || currencyRate >= 0.25) && numericRate >= 0.4
  const percent = percentName && numericRate >= 0.4
  const date = dateName || dateRate >= 0.55
  const category = categoryName || (filledValues.length >= 2 && uniqueRatio <= 0.55)

  return {
    name,
    filledCount: filledValues.length,
    numericRate,
    dateRate,
    uniqueCount,
    uniqueRatio,
    identifier,
    monetary,
    percent,
    date,
    category,
    savingName,
    comparableName,
    summaryName,
  }
}

function buildRecommendedMetrics(kind, signals) {
  if (kind === 'empty') return []
  if (kind === 'summary') return ['VOLUME']

  const metrics = []
  if (signals.monetaryColumns > 0) metrics.push('TOTAL')

  const hasEconomiaShape =
    (signals.monetaryColumns > 0 && signals.percentColumns > 0) ||
    signals.savingColumns > 0 ||
    (signals.monetaryColumns >= 2 && signals.comparableFinancialColumns >= 2)
  if (hasEconomiaShape) metrics.push('ECONOMIA')

  if (signals.monetaryColumns >= 2 && signals.comparableFinancialColumns >= 2) {
    metrics.push('VARIACAO')
  }

  metrics.push('VOLUME')
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
    comparableFinancialColumns: columns.filter(column => column.monetary && column.comparableName).length,
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

export function inferChartType(chart) {
  const declaredType = String(chart?.type || chart?.chart_type || '').toLowerCase()
  if (declaredType === 'doughnut') return 'donut'
  if (declaredType) return declaredType

  const firstSeries = chart?.option?.series?.[0] || {}
  const seriesType = String(firstSeries?.type || '').toLowerCase()
  if (!seriesType) return ''

  if (seriesType === 'line' && firstSeries?.areaStyle) return 'area'
  if (seriesType === 'pie') {
    if (firstSeries?.roseType) return 'nightingale'
    const radius = firstSeries?.radius
    if (Array.isArray(radius) && radius.length >= 2) return 'donut'
    return 'pie'
  }
  if (seriesType === 'bar') {
    const xAxisType = String(chart?.option?.xAxis?.type || '').toLowerCase()
    const yAxisType = String(chart?.option?.yAxis?.type || '').toLowerCase()
    if (xAxisType === 'value' && yAxisType === 'category') return 'hbar'
    return 'bar'
  }
  return seriesType
}

function chartDataStats(chart) {
  const labels = Array.isArray(chart?.labels) ? chart.labels : []
  const data = Array.isArray(chart?.data) ? chart.data : []
  const numeric = data
    .map(value => Number(value))
    .filter(value => Number.isFinite(value))
  const uniqueValues = new Set(numeric.map(value => value.toFixed(6))).size
  return {
    labelsCount: labels.length,
    dataCount: data.length,
    points: Math.min(labels.length, data.length),
    uniqueValues,
    totalGroups: Number.isFinite(Number(chart?.totalGroups)) ? Number(chart.totalGroups) : labels.length,
    truncated: Boolean(chart?.truncated),
    totalValues: Number.isFinite(Number(chart?.totalValues)) ? Number(chart.totalValues) : data.length,
  }
}

function chartRole(chart) {
  const explicitSource = String(chart?.source || chart?.aggregation || '').trim().toLowerCase()
  if (['by_category', 'distribution', 'by_date', 'top_items'].includes(explicitSource)) return explicitSource

  const title = String(chart?.title || '').toLowerCase()
  const type = inferChartType(chart)
  const stats = chartDataStats(chart)
  const labels = Array.isArray(chart?.labels) ? chart.labels : []
  const looksTemporal = labels.some(label => /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\/\d{4}$/i.test(String(label || '').trim()))
  const looksDistribution = title.includes('distribui') || (type === 'line' && stats.points > 3 && !looksTemporal)
  const looksTop = title.includes('top') || title.includes('ranking')
  const looksCategory = title.includes('categoria') || title.includes('por ')
  if (looksTemporal) return 'by_date'
  if (looksTop) return 'top_items'
  if (looksDistribution) return 'distribution'
  if (looksCategory) return 'by_category'
  return 'unknown'
}

function normalizeChartContent(chart) {
  const labels = Array.isArray(chart?.labels) ? chart.labels.map(label => String(label ?? '').trim()) : []
  const data = Array.isArray(chart?.data)
    ? chart.data.map(value => {
      const numeric = Number(value)
      return Number.isFinite(numeric) ? Number(numeric.toFixed(6)) : String(value ?? '')
    })
    : []
  return JSON.stringify({ labels, data })
}

function isPieLike(type) {
  return ['pie', 'donut', 'doughnut', 'nightingale'].includes(type)
}

function hasTemporalLabels(chart) {
  const labels = Array.isArray(chart?.labels) ? chart.labels : []
  return labels.some(label => /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\/\d{4}$/i.test(String(label || '').trim()))
}

export function getChartSelectionReason(chart) {
  const role = chartRole(chart)
  const type = inferChartType(chart)
  const stats = chartDataStats(chart)

  if (role === 'by_date') return 'Série temporal detectada'
  if (role === 'top_items') return 'Ranking dos maiores valores'
  if (role === 'by_category') {
    if (isPieLike(type) && stats.totalGroups <= 5) return 'Poucas categorias proporcionais'
    if (stats.totalGroups > 8 || stats.truncated) return 'Categoria ampla resumida em grupos'
    return 'Categoria principal detectada'
  }
  if (role === 'distribution') return 'Distribuição por grupo'
  return 'Padrão relevante nos dados'
}

function chartPriorityScore(chart) {
  const role = chartRole(chart)
  const type = inferChartType(chart)
  const stats = chartDataStats(chart)
  const roleScore = role === 'by_date' ? 4 : role === 'by_category' ? 3 : role === 'top_items' ? 3 : role === 'distribution' ? 1 : 0
  const typeScore =
    role === 'by_date'
      ? (type === 'line' || type === 'area' ? 4 : 0)
      : role === 'by_category'
        ? (type === 'bar' ? 4 : isPieLike(type) && stats.points <= 5 ? 2 : 0)
        : role === 'top_items'
          ? (type === 'hbar' || type === 'bar' ? 4 : 0)
          : role === 'distribution'
            ? (isPieLike(type) && stats.points <= 5 ? 2 : type === 'bar' ? 1 : 0)
            : 0
  const cardinalityScore =
    role === 'by_category'
      ? (stats.totalGroups >= 2 && stats.totalGroups <= 12 ? 3 : -4)
      : role === 'top_items'
        ? (stats.totalGroups > 8 || stats.truncated ? 3 : 1)
        : role === 'by_date'
          ? (hasTemporalLabels(chart) ? 2 : 0)
          : 0
  const densityPenalty = isPieLike(type) && stats.points > 6 ? 8 : 0
  return roleScore * 100 + typeScore * 10 + cardinalityScore - densityPenalty + Math.min(stats.points, 12)
}

function hasEnoughData(chart) {
  const stats = chartDataStats(chart)
  const role = chartRole(chart)
  if (stats.points < 2 || stats.dataCount < 2 || stats.labelsCount < 2) return false
  if (role === 'by_date') return stats.points >= 2 && hasTemporalLabels(chart)
  if (role === 'distribution') return stats.points >= 2 && stats.uniqueValues > 1
  return stats.uniqueValues > 1 || stats.totalGroups > 1
}

function isUsefulForSelection(chart) {
  const role = chartRole(chart)
  const type = inferChartType(chart)
  const stats = chartDataStats(chart)
  if (!hasEnoughData(chart)) return false
  if (isPieLike(type) && stats.points > 8) return false
  if (role === 'by_category' && stats.totalGroups > 18 && !stats.truncated) return false
  return true
}

export function selectMetricCharts(charts, metricType, datasetRowsCount = 0) {
  const available = Array.isArray(charts) ? charts.filter(chart => chart && chart.option && isUsefulForSelection(chart)) : []
  if (available.length === 0) return []

  const bySource = {
    by_category: [],
    by_date: [],
    top_items: [],
    distribution: [],
    unknown: [],
  }
  for (const chart of available) {
    bySource[chartRole(chart)].push(chart)
  }

  const pickBest = list => list
    .slice()
    .sort((a, b) => chartPriorityScore(b) - chartPriorityScore(a))[0]

  const selected = []
  const addIfPresent = chart => {
    if (!chart) return
    const source = chartRole(chart)
    if (selected.some(item => chartRole(item) === source)) return
    selected.push(chart)
  }

  const byCategory = pickBest(bySource.by_category)
  const byDate = pickBest(bySource.by_date)
  const topItems = pickBest(bySource.top_items)
  const distribution = pickBest(bySource.distribution)
  const categoryStats = byCategory ? chartDataStats(byCategory) : null
  const shouldPreferRanking = Boolean(topItems && (!categoryStats || categoryStats.totalGroups > 8 || categoryStats.truncated))

  addIfPresent(byDate)
  if (shouldPreferRanking) {
    addIfPresent(topItems)
    addIfPresent(byCategory)
  } else {
    addIfPresent(byCategory)
    addIfPresent(topItems)
  }

  if (selected.length < 3) addIfPresent(distribution)

  if (selected.length < 3) {
    const orderedFallback = [
      ...bySource.by_date,
      ...bySource.by_category,
      ...bySource.top_items,
      ...bySource.distribution,
      ...bySource.unknown,
    ]
    for (const chart of orderedFallback) {
      addIfPresent(chart)
      if (selected.length === 3) break
    }
  }

  const byContent = new Map()
  for (const chart of selected) {
    const contentKey = normalizeChartContent(chart)
    const existing = byContent.get(contentKey)
    if (!existing) {
      byContent.set(contentKey, chart)
      continue
    }
    const existingScore = chartPriorityScore(existing)
    const candidateScore = chartPriorityScore(chart)
    if (candidateScore > existingScore) byContent.set(contentKey, chart)
  }

  let finalCharts = Array.from(byContent.values())
  if (finalCharts.length > 3) finalCharts = finalCharts.slice(0, 3)
  if (finalCharts.length < 3) {
    const fillers = [
      ...bySource.by_date,
      ...bySource.by_category,
      ...bySource.top_items,
      ...bySource.distribution,
      ...bySource.unknown,
    ]
    for (const chart of fillers) {
      const source = chartRole(chart)
      if (finalCharts.some(item => chartRole(item) === source)) continue
      finalCharts.push(chart)
      if (finalCharts.length === 3) break
    }
  }

  finalCharts = finalCharts.slice(0, 3)
  const temporalMain = finalCharts.find(chart => chartRole(chart) === 'by_date')
  const categoryMain = finalCharts.find(chart => chartRole(chart) === 'by_category')
  const rankingMain = finalCharts.find(chart => chartRole(chart) === 'top_items')
  const mainCategoryStats = categoryMain ? chartDataStats(categoryMain) : null
  const categoryIsTooBroad = Boolean(mainCategoryStats && (mainCategoryStats.totalGroups > 8 || mainCategoryStats.truncated))
  const main = metricType === 'VARIACAO' || metricType === 'TAXA'
    ? (temporalMain || categoryMain || finalCharts[0])
    : (categoryIsTooBroad ? rankingMain : categoryMain) || categoryMain || temporalMain || finalCharts[0]
  if (main) {
    finalCharts = [main, ...finalCharts.filter(chart => chart !== main)].slice(0, 3)
  }
  return finalCharts.map(chart => ({
    ...chart,
    selectionReason: chart.selectionReason || getChartSelectionReason(chart),
  }))
}

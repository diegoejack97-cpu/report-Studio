const DARK_FAMILIES = {
  blueCyan: ['#60a5fa', '#22d3ee', '#38bdf8', '#818cf8', '#2dd4bf', '#93c5fd'],
  emerald: ['#34d399', '#10b981', '#84cc16', '#2dd4bf', '#a3e635', '#6ee7b7'],
  violet: ['#a78bfa', '#818cf8', '#c084fc', '#60a5fa', '#f472b6', '#22d3ee'],
  amber: ['#fbbf24', '#f59e0b', '#fb923c', '#fde047', '#f97316', '#facc15'],
  magenta: ['#f472b6', '#ec4899', '#a78bfa', '#fb7185', '#c084fc', '#60a5fa'],
  slateIce: ['#94a3b8', '#67e8f9', '#cbd5e1', '#60a5fa', '#a5b4fc', '#5eead4'],
}

const LIGHT_FAMILIES = {
  blueCyan: ['#2563eb', '#0891b2', '#0284c7', '#4f46e5', '#0f766e', '#1d4ed8'],
  emerald: ['#059669', '#16a34a', '#65a30d', '#0f766e', '#15803d', '#047857'],
  violet: ['#7c3aed', '#4f46e5', '#9333ea', '#2563eb', '#db2777', '#0891b2'],
  amber: ['#d97706', '#ca8a04', '#ea580c', '#b45309', '#f59e0b', '#a16207'],
  magenta: ['#db2777', '#be185d', '#7c3aed', '#e11d48', '#9333ea', '#2563eb'],
  slateIce: ['#475569', '#0891b2', '#64748b', '#2563eb', '#4f46e5', '#0f766e'],
}

const TYPE_FAMILIES = {
  pie: ['blueCyan', 'emerald', 'violet', 'amber', 'magenta', 'slateIce'],
  doughnut: ['blueCyan', 'emerald', 'violet', 'amber', 'magenta', 'slateIce'],
  donut: ['blueCyan', 'emerald', 'violet', 'amber', 'magenta', 'slateIce'],
  nightingale: ['violet', 'blueCyan', 'magenta', 'emerald', 'amber', 'slateIce'],
  bar: ['blueCyan', 'emerald', 'violet', 'amber', 'slateIce', 'magenta'],
  hbar: ['emerald', 'blueCyan', 'amber', 'violet', 'slateIce', 'magenta'],
  line: ['blueCyan', 'violet', 'emerald', 'amber', 'magenta', 'slateIce'],
  area: ['blueCyan', 'emerald', 'violet', 'amber', 'magenta', 'slateIce'],
  treemap: ['emerald', 'violet', 'blueCyan', 'amber', 'magenta', 'slateIce'],
  funnel: ['blueCyan', 'amber', 'emerald', 'violet', 'magenta', 'slateIce'],
  radar: ['violet', 'blueCyan', 'emerald', 'magenta', 'amber', 'slateIce'],
}

function chartType(chart = {}) {
  const explicit = chart.type || chart.chartType || chart.kind
  if (explicit) return String(explicit).toLowerCase()
  const firstSeries = Array.isArray(chart.option?.series) ? chart.option.series[0] : chart.option?.series
  if (firstSeries?.type) {
    if (firstSeries.type === 'pie' && Array.isArray(firstSeries.radius) && firstSeries.radius[0] !== '0%') return 'doughnut'
    return String(firstSeries.type).toLowerCase()
  }
  if (chart.source === 'top_items') return 'hbar'
  if (chart.source === 'by_date') return 'line'
  return 'bar'
}

export function rotatePalette(basePalette, offset = 0) {
  if (!Array.isArray(basePalette) || basePalette.length === 0) return []
  const normalized = Math.abs(offset) % basePalette.length
  return [...basePalette.slice(normalized), ...basePalette.slice(0, normalized)]
}

export function getChartPalette(chart = {}, index = 0, theme = 'dark', sameTypeIndex = 0) {
  const families = theme === 'dark' ? DARK_FAMILIES : LIGHT_FAMILIES
  const type = chartType(chart)
  const familyOrder = TYPE_FAMILIES[type] || TYPE_FAMILIES.bar
  const familyName = familyOrder[(index + sameTypeIndex) % familyOrder.length]
  const base = families[familyName] || families.blueCyan
  const rotation = (index * 2 + sameTypeIndex * 3) % base.length
  const accent = rotatePalette(base, rotation)
  const neutral = families.slateIce.filter(color => !accent.includes(color)).slice(0, 2)

  return {
    name: familyName,
    type,
    colors: [...accent, ...neutral],
  }
}

export function getSeriesColor(chartTypeValue, chartIndex = 0, seriesIndex = 0, theme = 'dark', sameTypeIndex = 0) {
  const palette = getChartPalette({ type: chartTypeValue }, chartIndex, theme, sameTypeIndex)
  return palette.colors[seriesIndex % palette.colors.length]
}

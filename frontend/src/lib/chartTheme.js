import { getChartPalette } from './chartPalettes.js'

const FALLBACK_DARK_PALETTE = ['#60a5fa', '#22d3ee', '#34d399', '#a78bfa', '#fbbf24', '#f472b6', '#94a3b8']
const FALLBACK_LIGHT_PALETTE = ['#2563eb', '#0891b2', '#059669', '#7c3aed', '#d97706', '#db2777', '#475569']

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]))
}

function toArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function mergeObject(base, override) {
  return { ...(base || {}), ...(override || {}) }
}

function firstSeriesType(series) {
  return toArray(series)[0]?.type || ''
}

function seriesDataLength(series) {
  const first = toArray(series)[0]
  return Array.isArray(first?.data) ? first.data.length : 0
}

export function getPremiumChartTheme(isDark = false, palette = null) {
  return {
    palette: Array.isArray(palette) && palette.length ? palette : (isDark ? FALLBACK_DARK_PALETTE : FALLBACK_LIGHT_PALETTE),
    text: isDark ? '#94a3b8' : '#475569',
    title: isDark ? '#d9e2ec' : '#1e293b',
    muted: isDark ? '#486581' : '#94a3b8',
    axisLine: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(15,23,42,0.12)',
    splitLine: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(15,23,42,0.075)',
    tooltipBg: isDark ? 'rgba(13,26,38,0.96)' : 'rgba(255,255,255,0.98)',
    tooltipBorder: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(37,99,235,0.18)',
    tooltipText: isDark ? '#d9e2ec' : '#1e293b',
    chartBg: 'transparent',
    itemBorder: isDark ? '#0d1a26' : '#ffffff',
    barBg: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(15,23,42,0.045)',
    areaOpacity: isDark ? 0.16 : 0.12,
  }
}

function withDataColor(data, palette, seriesType) {
  if (!Array.isArray(data)) return data
  return data.map((point, index) => {
    const color = palette[index % palette.length]
    const value = point && typeof point === 'object' && !Array.isArray(point)
      ? point
      : { value: point }
    return {
      ...value,
      itemStyle: {
        ...(value.itemStyle || {}),
        color,
        ...(seriesType === 'bar' ? { borderRadius: value.itemStyle?.borderRadius } : {}),
      },
    }
  })
}

export function premiumizeEChartOption(option, { isDark = false, chart = {}, chartIndex = 0, sameTypeIndex = 0 } = {}) {
  if (!option || typeof option !== 'object') return option

  const next = cloneValue(option)
  const seriesList = toArray(next.series)
  const type = firstSeriesType(next.series)
  const paletteMeta = getChartPalette({ ...chart, option: next, type: chart?.type || type }, chartIndex, isDark ? 'dark' : 'light', sameTypeIndex)
  const t = getPremiumChartTheme(isDark, paletteMeta.colors)
  const dataLength = seriesDataLength(next.series)
  const isPie = type === 'pie'
  const isLine = type === 'line'
  const isBar = type === 'bar'
  const crowded = dataLength > 8

  next.backgroundColor = next.backgroundColor || t.chartBg
  next.color = t.palette
  next.textStyle = mergeObject(next.textStyle, {
    color: t.text,
    fontFamily: 'DM Sans, system-ui, sans-serif',
  })

  next.tooltip = mergeObject(next.tooltip, {
    trigger: next.tooltip?.trigger || (isPie ? 'item' : 'axis'),
    confine: true,
    appendToBody: true,
    backgroundColor: t.tooltipBg,
    borderColor: t.tooltipBorder,
    borderWidth: 1,
    padding: [10, 12],
    textStyle: mergeObject(next.tooltip?.textStyle, {
      color: t.tooltipText,
      fontSize: 12,
      fontFamily: 'DM Sans, system-ui, sans-serif',
      lineHeight: 18,
    }),
    extraCssText: `box-shadow:0 16px 36px ${isDark ? 'rgba(0,0,0,.42)' : 'rgba(15,23,42,.16)'};border-radius:12px;backdrop-filter:blur(10px);`,
  })

  if (isPie) {
    next.legend = mergeObject(next.legend, {
      type: crowded ? 'scroll' : 'plain',
      orient: crowded ? 'horizontal' : 'vertical',
      left: crowded ? 0 : 'auto',
      right: crowded ? 0 : 4,
      top: crowded ? 'auto' : 'middle',
      bottom: crowded ? 0 : 'auto',
      itemWidth: 9,
      itemHeight: 9,
      icon: 'circle',
      pageIconColor: t.text,
      pageIconInactiveColor: t.muted,
      pageTextStyle: { color: t.text },
      textStyle: mergeObject(next.legend?.textStyle, {
        color: t.text,
        fontSize: 11,
        fontWeight: 600,
        overflow: 'truncate',
        width: crowded ? 120 : 96,
      }),
    })
  } else {
    next.legend = mergeObject(next.legend, {
      type: 'scroll',
      top: 0,
      left: 0,
      itemWidth: 14,
      itemHeight: 8,
      icon: 'roundRect',
      pageIconColor: t.text,
      pageIconInactiveColor: t.muted,
      pageTextStyle: { color: t.text },
      textStyle: mergeObject(next.legend?.textStyle, {
        color: t.text,
        fontSize: 11,
        fontWeight: 600,
      }),
    })
  }

  if (!isPie) {
    next.grid = mergeObject({
      left: 10,
      right: 16,
      top: next.legend === false ? 16 : 42,
      bottom: 18,
      containLabel: true,
    }, next.grid)
  }

  const decorateAxis = (axis, axisKind) => {
    if (!axis) return axis
    const list = toArray(axis).map(item => {
      const isCategory = item?.type === 'category'
      const label = mergeObject(item?.axisLabel, {
        color: t.text,
        fontSize: 10,
        fontWeight: 600,
        hideOverlap: true,
        margin: 10,
        interval: item?.axisLabel?.interval ?? (isCategory && crowded ? 'auto' : 0),
        rotate: item?.axisLabel?.rotate ?? (axisKind === 'x' && isCategory && crowded ? 25 : 0),
      })
      return {
        ...item,
        axisLabel: label,
        axisLine: mergeObject(item?.axisLine, { lineStyle: mergeObject(item?.axisLine?.lineStyle, { color: t.axisLine }) }),
        axisTick: mergeObject(item?.axisTick, { lineStyle: { color: t.axisLine }, alignWithLabel: true }),
        splitLine: mergeObject(item?.splitLine, { lineStyle: mergeObject(item?.splitLine?.lineStyle, { color: t.splitLine, type: 'dashed' }) }),
      }
    })
    return Array.isArray(axis) ? list : list[0]
  }

  next.xAxis = decorateAxis(next.xAxis, 'x')
  next.yAxis = decorateAxis(next.yAxis, 'y')

  next.series = seriesList.map((series, index) => {
    const color = t.palette[index % t.palette.length]
    if (series.type === 'bar') {
      const horizontal = next.yAxis?.type === 'category' || toArray(next.yAxis)[0]?.type === 'category'
      return {
        ...series,
        barMaxWidth: series.barMaxWidth || 34,
        barMinWidth: series.barMinWidth || 8,
        data: withDataColor(series.data, t.palette, 'bar'),
        itemStyle: mergeObject(series.itemStyle, {
          borderRadius: series.itemStyle?.borderRadius || (horizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]),
          shadowBlur: 0,
        }),
        emphasis: mergeObject(series.emphasis, { focus: 'series' }),
        showBackground: series.showBackground ?? true,
        backgroundStyle: mergeObject(series.backgroundStyle, {
          color: t.barBg,
          borderRadius: horizontal ? [0, 8, 8, 0] : [8, 8, 0, 0],
        }),
      }
    }

    if (series.type === 'line') {
      return {
        ...series,
        smooth: series.smooth ?? true,
        symbol: series.symbol || 'circle',
        symbolSize: series.symbolSize || 7,
        lineStyle: mergeObject(series.lineStyle, {
          width: series.lineStyle?.width || 3,
          color,
          shadowColor: color,
          shadowBlur: 8,
          shadowOffsetY: 3,
        }),
        itemStyle: mergeObject(series.itemStyle, {
          color,
          borderColor: t.itemBorder,
          borderWidth: 2,
        }),
        areaStyle: series.areaStyle === undefined
          ? { color, opacity: t.areaOpacity }
          : mergeObject(series.areaStyle, { color: series.areaStyle?.color || color, opacity: series.areaStyle?.opacity ?? t.areaOpacity }),
        emphasis: mergeObject(series.emphasis, { focus: 'series' }),
      }
    }

    if (series.type === 'pie') {
      const visibleLabels = dataLength <= 6
      return {
        ...series,
        data: withDataColor(series.data, t.palette, 'pie'),
        radius: series.radius || ['48%', '72%'],
        center: series.center || (crowded ? ['50%', '44%'] : ['42%', '50%']),
        avoidLabelOverlap: true,
        minShowLabelAngle: 8,
        label: mergeObject(series.label, {
          show: series.label?.show ?? visibleLabels,
          color: t.text,
          fontSize: 10,
          fontWeight: 600,
          overflow: 'truncate',
          width: 96,
        }),
        labelLine: mergeObject(series.labelLine, {
          show: series.labelLine?.show ?? visibleLabels,
          smooth: true,
          length: 10,
          length2: 8,
          lineStyle: { color: t.axisLine },
        }),
        itemStyle: mergeObject(series.itemStyle, {
          borderColor: t.itemBorder,
          borderWidth: 2,
          borderRadius: series.itemStyle?.borderRadius || 7,
        }),
        emphasis: mergeObject(series.emphasis, {
          scale: true,
          scaleSize: 5,
          itemStyle: { shadowBlur: 16, shadowColor: isDark ? 'rgba(0,0,0,.34)' : 'rgba(15,23,42,.16)' },
        }),
      }
    }

    return series
  })

  return next
}

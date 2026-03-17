import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { motion } from 'motion/react'
import { useThemeStore } from '@/store/themeStore'

function TableSection({ rows, visCols, cols, dark, cardBg, bdColor, p1, p2, textColor, subText, showFilters = true }) {
  const [selectedCol, setSelectedCol] = useState('')
  const [selectedVal, setSelectedVal] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const searchRef = useRef(null)
  const categoricalCols = (visCols || []).map(vc => {
    const vals = [...new Set(rows.map(r => String(r.cells?.[vc.i] ?? '').trim()).filter(Boolean))].sort()
    return vals.length >= 2 && vals.length <= 40 ? { ...vc, vals } : null
  }).filter(Boolean)
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
  const inputStyle = { background:dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)', border:`1px solid ${bdColor}`, borderRadius:6, color:textColor, fontSize:'0.72rem', padding:'0.25rem 0.5rem', outline:'none', width:'100%' }
  const pillStyle = { ...inputStyle, borderRadius: 999, padding: '0.38rem 0.75rem' }

  useEffect(() => {
    if (!showFilters) return
    const onKey = (e) => {
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
    <div className="rounded-2xl shadow-sm overflow-hidden mb-5" style={{background:cardBg,border:`1px solid ${bdColor}`}}>
      <div className="px-4 py-3 flex items-center justify-between" style={{borderBottom:`1px solid ${bdColor}`}}>
        <span className="text-xs font-bold uppercase tracking-wider" style={{color:p2}}>
          Todos os Registros — {hasFilter ? `${filteredRows.length} de ${rows.length}` : rows.length.toLocaleString('pt-BR')}
        </span>
        <div className="flex items-center gap-2">
          {hasFilter && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{background:'rgba(37,99,235,0.2)',color:'#60a5fa'}}>{activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''}</span>}
          {hasFilter && <button onClick={() => { setSelectedCol(''); setSelectedVal(''); setGlobalSearch('') }} style={{fontSize:'0.7rem',color:'#f87171',background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.3)',borderRadius:5,padding:'0.15rem 0.5rem'}}>x Limpar</button>}
        </div>
      </div>
      {showFilters && (
        <div className="px-4 py-3" style={{borderBottom:`1px solid ${bdColor}`,background:dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.02)'}}>
          <input ref={searchRef} style={{...pillStyle, marginBottom:'0.6rem'}} placeholder="Buscar em todos os campos... (/)" value={globalSearch} onChange={e => setGlobalSearch(e.target.value)}/>
          {categoricalCols.length > 0 && (
            <div style={{display:'grid',gridTemplateColumns:'minmax(180px,220px) minmax(220px,1fr)',gap:'0.5rem'}}>
              <select
                style={{...pillStyle,borderColor:selectedCol?'#3b82f6':bdColor,appearance:'none',cursor:'pointer'}}
                value={selectedCol}
                onChange={e => {
                  setSelectedCol(e.target.value)
                  setSelectedVal('')
                }}
              >
                <option value="">Filtrar por campo...</option>
                {categoricalCols.map(vc => <option key={vc.i} value={String(vc.i)}>{vc.name}</option>)}
              </select>
              <select
                style={{...pillStyle,borderColor:selectedVal?'#3b82f6':bdColor,appearance:'none',cursor:'pointer'}}
                value={selectedVal}
                onChange={e => setSelectedVal(e.target.value)}
                disabled={!activeCol}
              >
                <option value="">{activeCol ? 'Selecionar valor...' : 'Selecione um campo primeiro'}</option>
                {(activeCol?.vals || []).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto" style={{maxHeight:380}}>
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0">
            <tr style={{background:p1,color:'#fff'}}>
              {visCols.map((c,i) => <th key={i} className="px-3 py-2 text-left font-semibold uppercase text-[10px] tracking-wider whitespace-nowrap">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredRows.slice(0,200).map((row,ri) => (
              <tr key={ri} style={{background:ri%2===0?(dark?'rgba(255,255,255,0.02)':'#f8fafc'):'transparent'}}>
                {visCols.map((c,ci_) => <td key={ci_} className="px-3 py-1.5 whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis" style={{color:textColor}}>{row.cells?.[c.i]??''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRows.length === 0 && <div className="text-center py-8" style={{color:subText}}>Nenhum registro encontrado</div>}
      </div>
    </div>
  )
}

// ── Palettes ──────────────────────────────────────────────────────
const PAL_DARK  = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1','#14b8a6','#eab308']
const PAL_LIGHT = ['#1d4ed8','#059669','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#4f46e5','#0f766e','#ca8a04']

// ── Utils ──────────────────────────────────────────────────────────
const fmtBRL = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})
const fmtN   = v => Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2})

function pnum(v) {
  let s = String(v??'').trim().replace(/[R$€£¥\s]/g,'')
  if (!s) return 0
  const commas=(s.match(/,/g)||[]).length, dots=(s.match(/\./g)||[]).length
  if (commas===1&&/,\d{1,2}$/.test(s)) return parseFloat(s.replace(/\./g,'').replace(',','.'))||0
  if (dots===1&&/\.\d{1,2}$/.test(s))  return parseFloat(s.replace(/,/g,''))||0
  if (dots>1&&commas===0)               return parseFloat(s.replace(/\./g,''))||0
  return parseFloat(s.replace(',','.'))||0
}

function countByCol(rows, ci) {
  if (ci<0) return {labels:[],data:[]}
  const f={}
  rows.forEach(r=>{const k=String(r.cells?.[ci]??'').trim()||'(vazio)'; f[k]=(f[k]||0)+1})
  const s=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,20)
  return {labels:s.map(x=>x[0]), data:s.map(x=>x[1])}
}

function sumGrouped(rows, lci, vci, n=10) {
  if (lci<0||vci<0) return {labels:[],data:[]}
  const a={}
  rows.forEach(r=>{const k=String(r.cells?.[lci]??'').trim()||'(vazio)'; a[k]=(a[k]||0)+pnum(r.cells?.[vci])})
  const s=Object.entries(a).sort((a,b)=>b[1]-a[1]).slice(0,n)
  return {labels:s.map(x=>x[0]), data:s.map(x=>Math.round(x[1]*100)/100)}
}

function monthly(rows, dci, v1ci, v2ci) {
  if (dci<0) return {labels:[],d1:[],d2:[]}
  const MN=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const bk={}
  rows.forEach(r=>{
    const raw=String(r.cells?.[dci]??'').trim(); if(!raw) return
    let yr=null,mo=null,m
    m=raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
    if(m){mo=parseInt(m[2])-1;yr=parseInt(m[3])}
    if(!m){m=raw.match(/^(\d{1,2})[\/\-](\d{4})$/);if(m){mo=parseInt(m[1])-1;yr=parseInt(m[2])}}
    if(!m){m=raw.match(/^(\d{4})[\/\-](\d{1,2})/);if(m){yr=parseInt(m[1]);mo=parseInt(m[2])-1}}
    if(mo==null||mo<0||mo>11) return
    if(!yr||yr<1900) yr=new Date().getFullYear()
    const k=`${yr}-${String(mo+1).padStart(2,'0')}`
    if(!bk[k]) bk[k]={yr,mo,v1:0,v2:0}
    if(v1ci>=0) bk[k].v1+=pnum(r.cells?.[v1ci])
    if(v2ci>=0) bk[k].v2+=pnum(r.cells?.[v2ci])
  })
  const sorted=Object.entries(bk).sort((a,b)=>a[0].localeCompare(b[0]))
  const multiYr=new Set(sorted.map(([_,v])=>v.yr)).size>1
  return {
    labels: sorted.map(([_,v])=>MN[v.mo]+(multiYr?`/${v.yr}`:'')),
    d1: sorted.map(([_,v])=>Math.round(v.v1*100)/100),
    d2: sorted.map(([_,v])=>Math.round(v.v2*100)/100),
  }
}

// ── ECharts theme helpers ──────────────────────────────────────────
function getTheme(dark) {
  return {
    bg:       dark ? 'transparent'     : 'transparent',
    textColor:dark ? '#94a3b8'         : '#64748b',
    axisLine: dark ? '#1c3350'         : '#e2e8f0',
    splitLine:dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    tooltip:  dark
      ? { bg:'#0d1a26', border:'rgba(255,255,255,0.12)', text:'#d9e2ec' }
      : { bg:'#ffffff', border:'rgba(0,0,0,0.12)',       text:'#1e293b' },
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

// ── Chart Components ───────────────────────────────────────────────

function EChart({ option, h=240, style }) {
  return (
    <ReactECharts
      option={option}
      style={{ height: h, width: '100%', ...style }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  )
}

function ChartCard({ title, h=240, full=false, children }) {
  const { dark } = useThemeStore()
  return (
    <motion.div
      initial={{ opacity:0, scale:.97 }} animate={{ opacity:1, scale:1 }}
      className={`rounded-2xl p-4 shadow-sm ${full?'col-span-2':''}`}
      style={{ background: dark?'#0d1a26':'#ffffff', border: `1px solid ${dark?'rgba(255,255,255,0.08)':'#e2e8f0'}` }}
    >
      <div className="text-xs font-bold uppercase tracking-wider mb-3 pb-2"
        style={{ color: dark?'#94a3b8':'#64748b', borderBottom:`1px solid ${dark?'rgba(255,255,255,0.06)':'#f1f5f9'}` }}>
        {title}
      </div>
      <div style={{ height: h }}>{children}</div>
    </motion.div>
  )
}

// Donut / Pie / Nightingale / Polar
function PieChart({ data, labels, type='doughnut', title, h, dark }) {
  const t = getTheme(dark)
  const isNight = type==='nightingale'
  const isDonut = type==='doughnut'

  const option = {
    ...baseOpts(t),
    color: t.pal,
    legend: {
      orient: 'vertical', right: 0, top: 'center',
      textStyle: { color: t.textColor, fontSize: 11 },
      icon: 'circle', itemWidth: 8, itemHeight: 8,
    },
    series: [{
      type: 'pie',
      radius: isDonut ? ['45%','72%'] : isNight ? ['15%','72%'] : ['0%','72%'],
      center: ['42%','50%'],
      roseType: isNight ? 'radius' : false,
      data: data.map((v,i) => ({ value: v, name: labels[i] })),
      label: { show: !isNight, formatter: '{b}\n{d}%', fontSize: 10, color: t.textColor },
      labelLine: { smooth: true, length: 8, length2: 6 },
      emphasis: { itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0,0,0,0.4)' } },
      itemStyle: { borderRadius: isDonut ? 6 : 0, borderColor: dark?'#0d1a26':'#fff', borderWidth: 2 },
    }],
  }
  return <EChart option={option} h={h} />
}

// Bar / Hbar
function BarChart({ data, labels, horizontal=false, title, h, dark, isNum=false }) {
  const t = getTheme(dark)
  const option = {
    ...baseOpts(t),
    color: t.pal,
    grid: { left: horizontal?'22%':'3%', right:'4%', top:'6%', bottom:'12%', containLabel: !horizontal },
    xAxis: horizontal
      ? { type:'value', axisLabel:{ color:t.textColor, fontSize:10, formatter: isNum ? v=>fmtBRL(v).replace('R$\u00a0','') : undefined }, splitLine:{lineStyle:{color:t.splitLine}}, axisLine:{lineStyle:{color:t.axisLine}} }
      : { type:'category', data:labels, axisLabel:{ color:t.textColor, fontSize:10, interval:0, rotate: labels.length>8?30:0 }, axisLine:{lineStyle:{color:t.axisLine}} },
    yAxis: horizontal
      ? { type:'category', data:labels, axisLabel:{ color:t.textColor, fontSize:10 }, axisLine:{lineStyle:{color:t.axisLine}} }
      : { type:'value', axisLabel:{ color:t.textColor, fontSize:10, formatter: isNum ? v=>fmtBRL(v).replace('R$\u00a0','') : undefined }, splitLine:{lineStyle:{color:t.splitLine}}, axisLine:{lineStyle:{color:t.axisLine}} },
    tooltip: { ...baseOpts(t).tooltip, trigger:'axis', formatter: isNum ? p=>`${p[0].name}<br/>${fmtBRL(p[0].value)}` : undefined },
    series: [{
      type: 'bar',
      data: data.map((v,i) => ({
        value: v,
        itemStyle: { color: t.pal[i%t.pal.length], borderRadius: horizontal?[0,6,6,0]:[6,6,0,0] }
      })),
      emphasis: { itemStyle: { shadowBlur:16, shadowColor:'rgba(0,0,0,.3)' } },
      showBackground: true,
      backgroundStyle: { color: dark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.03)', borderRadius: horizontal?[0,6,6,0]:[6,6,0,0] },
    }],
  }
  return <EChart option={option} h={h} />
}

// Line / Area
function LineChart({ labels, d1, d2, name1='V1', name2='V2', type='line', h, dark, isNum=false }) {
  const t = getTheme(dark)
  const isArea = type==='area'
  const mkSeries = (data, name, color, idx) => ({
    type:'line', name, data,
    smooth: true, symbol:'circle', symbolSize:6,
    lineStyle: { width:2.5, color },
    itemStyle: { color, borderColor: dark?'#0d1a26':'#fff', borderWidth:2 },
    areaStyle: isArea ? { color: { type:'linear', x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:color+'55'},{offset:1,color:color+'00'}] } } : undefined,
    emphasis: { focus:'series' },
  })
  const option = {
    ...baseOpts(t),
    color: t.pal,
    grid: { left:'3%', right:'4%', top:'14%', bottom:'12%', containLabel:true },
    legend: { top:0, textStyle:{ color:t.textColor, fontSize:11 }, icon:'roundRect', itemWidth:14, itemHeight:8 },
    xAxis: { type:'category', data:labels, axisLabel:{ color:t.textColor, fontSize:10 }, axisLine:{lineStyle:{color:t.axisLine}}, boundaryGap:false },
    yAxis: { type:'value', axisLabel:{ color:t.textColor, fontSize:10, formatter: isNum ? v=>fmtBRL(v).replace('R$\u00a0','') : undefined }, splitLine:{lineStyle:{color:t.splitLine}}, axisLine:{lineStyle:{color:t.axisLine}} },
    tooltip: { ...baseOpts(t).tooltip, trigger:'axis', formatter: isNum ? p=>`${p[0].axisValue}<br/>${p.map(s=>`${s.marker}${s.seriesName}: ${fmtBRL(s.value)}`).join('<br/>')}` : undefined },
    series: [
      mkSeries(d1, name1, t.pal[0], 0),
      ...(d2&&d2.some(v=>v!==0) ? [mkSeries(d2, name2, t.pal[1], 1)] : []),
    ],
  }
  return <EChart option={option} h={h} />
}

// Radar
function RadarChart({ data, labels, h, dark }) {
  const t = getTheme(dark)
  const mx = Math.max(...data, 1)
  const option = {
    ...baseOpts(t),
    color: t.pal,
    radar: {
      indicator: labels.slice(0,8).map((n,i)=>({ name:n, max: data[i]*1.3 })),
      axisName: { color: t.textColor, fontSize:10 },
      splitArea: { areaStyle:{ color: dark?['rgba(255,255,255,0.02)','rgba(255,255,255,0.04)']:['rgba(0,0,0,0.02)','rgba(0,0,0,0.04)'] } },
      splitLine: { lineStyle:{ color: t.splitLine } },
      axisLine:  { lineStyle:{ color: t.axisLine } },
    },
    series: [{ type:'radar', data:[{ value:data.slice(0,8), name:'Valor', areaStyle:{ color: t.pal[0]+'44' }, lineStyle:{ color:t.pal[0], width:2 }, itemStyle:{ color:t.pal[0] } }] }],
  }
  return <EChart option={option} h={h} />
}

// Scatter
function ScatterChart({ xData, yData, labels, h, dark, xName='X', yName='Y' }) {
  const t = getTheme(dark)
  const option = {
    ...baseOpts(t),
    color: t.pal,
    grid: { left:'8%', right:'4%', top:'6%', bottom:'12%', containLabel:true },
    xAxis: { type:'value', name:xName, nameTextStyle:{color:t.textColor,fontSize:10}, axisLabel:{color:t.textColor,fontSize:10}, splitLine:{lineStyle:{color:t.splitLine}}, axisLine:{lineStyle:{color:t.axisLine}} },
    yAxis: { type:'value', name:yName, nameTextStyle:{color:t.textColor,fontSize:10}, axisLabel:{color:t.textColor,fontSize:10,formatter:v=>fmtBRL(v).replace('R$\u00a0','')}, splitLine:{lineStyle:{color:t.splitLine}}, axisLine:{lineStyle:{color:t.axisLine}} },
    tooltip: { ...baseOpts(t).tooltip, formatter: p=>`${labels[p.dataIndex]||''}<br/>${xName}: ${fmtN(p.data[0])}<br/>${yName}: ${fmtBRL(p.data[1])}` },
    series: [{ type:'scatter', data: xData.map((x,i)=>[x, yData[i]]), symbolSize: 10, itemStyle:{ color: t.pal[0], opacity:.75 }, emphasis:{ itemStyle:{ shadowBlur:16, shadowColor:'rgba(0,0,0,.4)' } } }],
  }
  return <EChart option={option} h={h} />
}

// Waterfall (saving breakdown)
function WaterfallChart({ categories, values, h, dark }) {
  const t = getTheme(dark)
  // valores: positivo=ganho, negativo=perda, usando bar empilhada com invisible base
  const helpers=[], bars=[]
  let base=0
  values.forEach((v,i)=>{
    helpers.push(v>=0?base:base+v)
    bars.push(Math.abs(v))
    base+=v
  })
  const option = {
    ...baseOpts(t),
    color: t.pal,
    grid:{ left:'3%',right:'4%',top:'6%',bottom:'12%',containLabel:true },
    xAxis: { type:'category', data:categories, axisLabel:{color:t.textColor,fontSize:10}, axisLine:{lineStyle:{color:t.axisLine}} },
    yAxis: { type:'value', axisLabel:{color:t.textColor,fontSize:10,formatter:v=>fmtBRL(v).replace('R$\u00a0','')}, splitLine:{lineStyle:{color:t.splitLine}}, axisLine:{lineStyle:{color:t.axisLine}} },
    tooltip: { ...baseOpts(t).tooltip, trigger:'axis', formatter: p=>{ const real=p.find(s=>s.seriesName==='Valor'); return real?`${p[0].name}<br/>${fmtBRL(values[real.dataIndex])}`:'' } },
    series: [
      { name:'_base', type:'bar', stack:'total', data:helpers, itemStyle:{color:'transparent'}, tooltip:{show:false} },
      { name:'Valor', type:'bar', stack:'total', data:values.map((v,i)=>({ value:bars[i], itemStyle:{ color:v>=0?t.pal[1]:t.pal[3], borderRadius:[6,6,0,0] } })), emphasis:{ itemStyle:{shadowBlur:16,shadowColor:'rgba(0,0,0,.3)'} } },
    ],
  }
  return <EChart option={option} h={h} />
}

// Heatmap Calendar (distribuição por mês/categoria)
function HeatmapChart({ data, xLabels, yLabels, h, dark }) {
  const t = getTheme(dark)
  const mx = Math.max(...data.map(d=>d[2]),1)
  const option = {
    ...baseOpts(t),
    color: t.pal,
    grid: { left:'12%', right:'12%', top:'10%', bottom:'12%' },
    xAxis: { type:'category', data:xLabels, axisLabel:{color:t.textColor,fontSize:10}, axisLine:{lineStyle:{color:t.axisLine}}, splitArea:{show:true, areaStyle:{color: dark?['rgba(255,255,255,0.02)','rgba(255,255,255,0.04)']:['rgba(0,0,0,0.02)','rgba(0,0,0,0.04)']}} },
    yAxis: { type:'category', data:yLabels, axisLabel:{color:t.textColor,fontSize:10}, axisLine:{lineStyle:{color:t.axisLine}}, splitArea:{show:true, areaStyle:{color: dark?['rgba(255,255,255,0.02)','rgba(255,255,255,0.04)']:['rgba(0,0,0,0.02)','rgba(0,0,0,0.04)']}} },
    visualMap: { min:0, max:mx, calculable:true, orient:'horizontal', left:'center', bottom:0, textStyle:{color:t.textColor,fontSize:10}, inRange:{color: dark?['#1c3350','#3b82f6','#10b981']:['#e0f2fe','#3b82f6','#059669']} },
    tooltip: { ...baseOpts(t).tooltip, formatter: p=>`${p.data[1]} / ${p.data[0]}<br/>${fmtN(p.data[2])}` },
    series: [{ type:'heatmap', data, label:{show:false}, emphasis:{itemStyle:{shadowBlur:20,shadowColor:'rgba(0,0,0,.5)'}} }],
  }
  return <EChart option={option} h={h} />
}

// Treemap
function TreemapChart({ data, labels, h, dark }) {
  const t = getTheme(dark)
  const option = {
    ...baseOpts(t),
    color: t.pal,
    tooltip: { ...baseOpts(t).tooltip, formatter: p=>`${p.name}<br/>${fmtN(p.value)}` },
    series: [{
      type:'treemap',
      data: data.map((v,i)=>({ name:labels[i], value:v, itemStyle:{ color:t.pal[i%t.pal.length] } })),
      label: { show:true, formatter:'{b}', fontSize:11, color:'#fff' },
      upperLabel: { show:false },
      breadcrumb: { show:false },
      roam:false,
      leafDepth:1,
      emphasis:{ focus:'self', itemStyle:{shadowBlur:16,shadowColor:'rgba(0,0,0,.4)'} },
    }],
  }
  return <EChart option={option} h={h} />
}

// Funnel
function FunnelChart({ data, labels, h, dark }) {
  const t = getTheme(dark)
  const option = {
    ...baseOpts(t),
    color: t.pal,
    tooltip: { ...baseOpts(t).tooltip, formatter: p=>`${p.name}: ${fmtN(p.value)}` },
    series: [{
      type:'funnel',
      left:'10%', width:'80%', top:'5%', bottom:'5%',
      sort:'descending',
      data: data.map((v,i)=>({ value:v, name:labels[i], itemStyle:{ color:t.pal[i%t.pal.length] } })),
      label: { show:true, position:'inside', color:'#fff', fontSize:11, fontWeight:'bold' },
      emphasis:{ itemStyle:{shadowBlur:16,shadowColor:'rgba(0,0,0,.4)'} },
    }],
  }
  return <EChart option={option} h={h} />
}

// Gauge KPI
function GaugeChart({ value, max, label, h, dark }) {
  const t = getTheme(dark)
  const pct = Math.min((value/Math.max(max,1))*100,100)
  const option = {
    ...baseOpts(t),
    series: [{
      type:'gauge',
      startAngle:200, endAngle:-20,
      min:0, max:100,
      splitNumber:5,
      radius:'85%',
      axisLine:{ lineStyle:{ width:18, color:[[pct/100,t.pal[1]],[1,dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)']] } },
      pointer:{ show:false },
      axisTick:{ show:false },
      splitLine:{ show:false },
      axisLabel:{ show:false },
      detail:{ valueAnimation:true, formatter:`${pct.toFixed(0)}%\n${label}`, fontSize:14, fontWeight:'bold', color:t.pal[1], offsetCenter:[0,'0%'], lineHeight:20 },
      data:[{ value:pct }],
    }],
  }
  return <EChart option={option} h={h} />
}

// ── KPI Card ───────────────────────────────────────────────────────
function KPICard({ kpi, cols, rows, dark }) {
  const ci = kpi.col===''||kpi.col==null ? -1 : parseInt(kpi.col)
  let val = '—'
  if (ci<0) { val = rows.length.toLocaleString('pt-BR') }
  else {
    const isNum = cols[ci]?.type==='number'
    const vals  = rows.map(r=>r.cells?.[ci]).filter(Boolean)
    const nums  = vals.map(v=>pnum(v))
    switch(kpi.fmt) {
      case 'sum':      { const s=nums.reduce((a,b)=>a+b,0); val=isNum?fmtBRL(s):fmtN(s); break }
      case 'avg':      if(nums.length){val=isNum?fmtBRL(nums.reduce((a,b)=>a+b,0)/nums.length):fmtN(nums.reduce((a,b)=>a+b,0)/nums.length)} break
      case 'max':      if(nums.length){val=isNum?fmtBRL(Math.max(...nums)):fmtN(Math.max(...nums))} break
      case 'min':      if(nums.length){val=isNum?fmtBRL(Math.min(...nums)):fmtN(Math.min(...nums))} break
      case 'count':    val=vals.filter(Boolean).length.toLocaleString('pt-BR'); break
      case 'countuniq':val=new Set(vals.filter(Boolean)).size.toLocaleString('pt-BR'); break
      case 'topval':   { const f={};vals.forEach(v=>{if(v)f[v]=(f[v]||0)+1});const top=Object.entries(f).sort((a,b)=>b[1]-a[1])[0];val=top?`${String(top[0]).substring(0,20)} (${top[1]})`:'-'; break }
    }
  }
  return (
    <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
      className="rounded-2xl p-4 flex-1 min-w-[120px] text-center shadow-sm"
      style={{ background:dark?'#0d1a26':'#fff', border:`1px solid ${dark?'rgba(255,255,255,0.08)':'#e2e8f0'}`, borderTop:`4px solid ${kpi.color||'#3b82f6'}` }}>
      <div className="text-xl mb-1">{kpi.icon||'📊'}</div>
      <div className="text-lg font-extrabold font-mono break-words leading-tight" style={{color:kpi.color||'#3b82f6'}}>{val}</div>
      <div className="text-[10px] mt-1 font-bold uppercase tracking-wider" style={{color:dark?'#486581':'#94a3b8'}}>{kpi.label}</div>
    </motion.div>
  )
}

// ── Main Preview ───────────────────────────────────────────────────
export default function ReportPreview({ state }) {
  const { dark } = useThemeStore()
  const {
    cols=[], rows=[], kpis=[], colors={}, sections={},
    saving:savCfg={}, charts:chCfg={}, groupCol
  } = state

  const p1  = colors.primary   || '#1a3a5c'
  const p2  = colors.secondary || '#2e5c8a'
  const acc = colors.accent    || '#4ade80'

  const ci  = v => { const n=parseInt(v); return isNaN(n)||n<0||n>=cols.length?-1:n }
  const sCI=ci(savCfg.savingCol), v1CI=ci(savCfg.v1Col), v2CI=ci(savCfg.v2Col)
  const sumCol = idx => idx<0?0:rows.reduce((s,r)=>s+pnum(r.cells?.[idx]),0)
  const sv=sumCol(sCI), v1=sumCol(v1CI), v2=sumCol(v2CI)
  const savTotal = sCI>=0?sv:(v1CI>=0&&v2CI>=0?v1-v2:v1CI>=0?v1:0)

  // chart data
  const g1=chCfg.g1||{}, g2=chCfg.g2||{}, g3=chCfg.g3||{}, g4=chCfg.g4||{}
  const D1 = g1.on!==false ? countByCol(rows,ci(g1.col))       : {labels:[],data:[]}
  const D2 = g2.on!==false ? countByCol(rows,ci(g2.col))       : {labels:[],data:[]}
  const D3 = g3.on!==false ? monthly(rows,ci(g3.dateCol),ci(g3.v1Col),ci(g3.v2Col)) : {labels:[],d1:[],d2:[]}
  const D4 = g4.on!==false ? sumGrouped(rows,ci(g4.labelCol),ci(g4.valCol),g4.n||10) : {labels:[],data:[]}
  const g4isNum = ci(g4.valCol)>=0 && cols[ci(g4.valCol)]?.type==='number'
  const g3v1Name = ci(g3.v1Col)>=0 ? cols[ci(g3.v1Col)]?.name||'V1' : 'V1'
  const g3v2Name = ci(g3.v2Col)>=0 ? cols[ci(g3.v2Col)]?.name||'V2' : 'V2'

  // Extra charts: heatmap colxcol, scatter, treemap
  const numCols = cols.map((c,i)=>({...c,i})).filter(c=>c.type==='number')
  const catCols = cols.map((c,i)=>({...c,i})).filter(c=>c.type==='text'&&c.uniq>=2&&c.uniq<=30)

  // Heatmap: 2 cat cols cross-tab
  const heatData = useMemo(()=>{
    if(catCols.length<2||!rows.length) return null
    const c1=catCols[0].i, c2=catCols[1].i
    const m={}
    rows.forEach(r=>{
      const x=String(r.cells?.[c1]??'').trim(), y=String(r.cells?.[c2]??'').trim()
      if(!x||!y) return
      if(!m[x]) m[x]={}
      m[x][y]=(m[x][y]||0)+1
    })
    const xs=Object.keys(m).slice(0,10), ys=[...new Set(Object.values(m).flatMap(o=>Object.keys(o)))].slice(0,8)
    const data=[]
    xs.forEach((x,xi)=>ys.forEach((y,yi)=>{ if((m[x]||{})[y]) data.push([xi,yi,(m[x]||{})[y]||0]) }))
    return {data, xLabels:xs, yLabels:ys}
  },[rows,cols])

  // Scatter: 2 numeric cols
  const scatterData = useMemo(()=>{
    if(numCols.length<2||!rows.length) return null
    const c1=numCols[0].i, c2=numCols[1].i
    const pts=rows.map(r=>({ x:pnum(r.cells?.[c1]), y:pnum(r.cells?.[c2]) })).filter(p=>p.x||p.y).slice(0,200)
    return { xData:pts.map(p=>p.x), yData:pts.map(p=>p.y), xName:numCols[0].name, yName:numCols[1].name }
  },[rows,cols])

  // Treemap: same as D1 if enough data
  const treemapData = useMemo(()=>{
    if(!D4.labels.length||D4.labels.length<3) return null
    return { labels:D4.labels, data:D4.data }
  },[D4])

  // Summary
  const grpCI=ci(groupCol)
  const summaryData = useMemo(()=>{
    if(grpCI<0) return []
    const agg={}
    rows.forEach(r=>{
      const k=String(r.cells?.[grpCI]??'').trim()||'(vazio)'
      if(!agg[k]) agg[k]={n:0,v1:0,v2:0}
      agg[k].n++
      if(v1CI>=0) agg[k].v1+=pnum(r.cells?.[v1CI])
      if(v2CI>=0) agg[k].v2+=pnum(r.cells?.[v2CI])
    })
    return Object.entries(agg).sort((a,b)=>b[1].n-a[1].n)
  },[rows,grpCI,v1CI,v2CI])

  const visCols = cols.map((c,i)=>({...c,i})).filter(c=>c.vis!==false)

  // Waterfall: saving por categoria (se tiver agrupamento + saving)
  const waterfallData = useMemo(()=>{
    if(grpCI<0||sCI<0) return null
    const agg={}
    rows.forEach(r=>{
      const k=String(r.cells?.[grpCI]??'').trim()||'(vazio)'
      agg[k]=(agg[k]||0)+pnum(r.cells?.[sCI])
    })
    const sorted=Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,8)
    return { cats:sorted.map(x=>x[0]), vals:sorted.map(x=>Math.round(x[1]*100)/100) }
  },[rows,grpCI,sCI])

  const bgColor = dark ? '#080f18' : '#eef1f5'
  const cardBg  = dark ? '#0d1a26' : '#ffffff'
  const bdColor = dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'
  const textColor = dark ? '#d9e2ec' : '#1e293b'
  const subText   = dark ? '#486581' : '#94a3b8'

  return (
    <div className="p-4" style={{ background:bgColor, minHeight:'100%', color:textColor, transition:'background .25s,color .25s' }}>
      <div style={{ maxWidth:1400, margin:'0 auto' }}>

        {/* Header */}
        <div className="mb-6" style={{position:'relative',paddingBottom:'1.25rem'}}>
          <div style={{position:'absolute',top:0,left:0,width:48,height:3,borderRadius:2,background:dark?'linear-gradient(90deg,#2563eb,#06b6d4)':'linear-gradient(90deg,#2563eb,#0ea5e9)'}}/>
          <div style={{paddingTop:'1rem',display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:'0.5rem'}}>
            <div>
              <h1 style={{fontSize:'1.6rem',fontWeight:700,letterSpacing:'-0.03em',color:textColor,lineHeight:1.15,marginBottom:state.subtitle?'0.2rem':0}}>
                {state.title||'Relatorio'}
              </h1>
              {state.subtitle&&<p style={{fontSize:'0.8rem',fontWeight:400,color:subText,margin:0}}>{state.subtitle}</p>}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'wrap'}}>
              {state.period&&<span style={{fontSize:'0.7rem',fontWeight:500,color:dark?'#64748b':'#94a3b8',background:dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)',border:`1px solid ${bdColor}`,borderRadius:6,padding:'0.2rem 0.6rem'}}>{state.period}</span>}
              {state.company&&<span style={{fontSize:'0.7rem',fontWeight:500,color:dark?'#64748b':'#94a3b8',background:dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)',border:`1px solid ${bdColor}`,borderRadius:6,padding:'0.2rem 0.6rem'}}>{state.company}</span>}
              <span style={{fontSize:'0.7rem',fontWeight:600,color:dark?'#3b82f6':'#2563eb',background:dark?'rgba(37,99,235,0.12)':'rgba(37,99,235,0.08)',border:`1px solid ${dark?'rgba(37,99,235,0.3)':'rgba(37,99,235,0.2)'}`,borderRadius:6,padding:'0.2rem 0.6rem'}}>{rows.length.toLocaleString('pt-BR')} registros</span>
            </div>
          </div>
          <div style={{position:'absolute',bottom:0,left:0,right:0,height:1,background:dark?'linear-gradient(90deg,rgba(37,99,235,0.4),rgba(255,255,255,0.05) 60%,transparent)':'linear-gradient(90deg,rgba(37,99,235,0.3),rgba(0,0,0,0.04) 60%,transparent)'}}/>
        </div>

        {/* Saving Banner */}
        {sections.saving!==false&&(
          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
            className="rounded-2xl p-5 mb-5 flex items-center justify-between overflow-hidden relative"
            style={{background:`linear-gradient(135deg,${p1},${p2})`,color:'#fff'}}>
            <div>
              <div className="text-xs opacity-60 uppercase tracking-widest mb-1">{savCfg.label||'Saving'}</div>
              <div className="text-4xl font-extrabold font-mono" style={{color:acc}}>{fmtBRL(savTotal)}</div>
              <div className="flex gap-6 mt-3 flex-wrap items-center">
                {v1CI>=0&&<div><div className="text-sm font-bold font-mono">{fmtBRL(v1)}</div><div className="text-[10px] opacity-50">{savCfg.v1Label||'Valor 1'}</div></div>}
                {v1CI>=0&&v2CI>=0&&<div className="opacity-30 text-lg">→</div>}
                {v2CI>=0&&<div><div className="text-sm font-bold font-mono" style={{color:acc}}>{fmtBRL(v2)}</div><div className="text-[10px] opacity-50">{savCfg.v2Label||'Valor 2'}</div></div>}
              </div>
            </div>
            <div className="text-[80px] opacity-[0.07] select-none">💹</div>
          </motion.div>
        )}

        {/* KPIs */}
        {sections.kpi!==false&&kpis.length>0&&(
          <div className="flex gap-3 mb-5 flex-wrap">
            {kpis.map((k,i)=><KPICard key={i} kpi={k} cols={cols} rows={rows} dark={dark}/>)}
          </div>
        )}

        {/* Charts Grid */}
        {sections.charts!==false&&(
          <div className="grid grid-cols-2 gap-4 mb-5">

            {/* G1 — Donut / Pie / Nightingale / Polar */}
            {g1.on!==false&&D1.labels.length>0&&(
              <ChartCard title={g1.title||'Distribuição'} h={g1.h||260}>
                {['doughnut','pie','nightingale'].includes(g1.type||'doughnut')
                  ? <PieChart {...D1} type={g1.type||'doughnut'} h={g1.h||260} dark={dark}/>
                  : g1.type==='treemap'
                    ? <TreemapChart {...D1} h={g1.h||260} dark={dark}/>
                    : g1.type==='funnel'
                      ? <FunnelChart {...D1} h={g1.h||260} dark={dark}/>
                      : <BarChart {...D1} horizontal={g1.type==='hbar'} h={g1.h||260} dark={dark}/>
                }
              </ChartCard>
            )}

            {/* G2 — Bar / Hbar / Line / Radar */}
            {g2.on!==false&&D2.labels.length>0&&(
              <ChartCard title={g2.title||'Por Categoria'} h={g2.h||260}>
                {g2.type==='radar'
                  ? <RadarChart labels={D2.labels} data={D2.data} h={g2.h||260} dark={dark}/>
                  : g2.type==='line'||g2.type==='area'
                    ? <LineChart labels={D2.labels} d1={D2.data} d2={[]} name1={cols[ci(g2.col)]?.name||'G2'} type={g2.type} h={g2.h||260} dark={dark}/>
                    : <BarChart {...D2} horizontal={g2.type==='hbar'} h={g2.h||260} dark={dark}/>
                }
              </ChartCard>
            )}

            {/* G3 — Line / Area temporal */}
            {g3.on!==false&&D3.labels.length>0&&(
              <ChartCard title={g3.title||'Evolução Mensal'} h={g3.h||300} full>
                <LineChart labels={D3.labels} d1={D3.d1} d2={D3.d2} name1={g3v1Name} name2={g3v2Name} type={g3.type||'area'} h={g3.h||300} dark={dark} isNum/>
              </ChartCard>
            )}

            {/* G4 — TopN hbar / doughnut / treemap / funnel */}
            {g4.on!==false&&D4.labels.length>0&&(
              <ChartCard title={g4.title||`Top ${g4.n||10}`} h={g4.h||400} full>
                {g4.type==='doughnut'||g4.type==='pie'
                  ? <PieChart {...D4} type={g4.type} h={g4.h||400} dark={dark}/>
                  : g4.type==='treemap'
                    ? <TreemapChart {...D4} h={g4.h||400} dark={dark}/>
                    : g4.type==='funnel'
                      ? <FunnelChart {...D4} h={g4.h||400} dark={dark}/>
                      : <BarChart {...D4} horizontal={g4.type!=='bar'} h={g4.h||400} dark={dark} isNum={g4isNum}/>
                }
              </ChartCard>
            )}

            {/* EXTRA: Heatmap cruzado (automático se tiver 2 cols categóricas) */}
            {heatData&&heatData.data.length>0&&(
              <ChartCard title={`Heatmap — ${catCols[0]?.name} × ${catCols[1]?.name}`} h={280} full>
                <HeatmapChart {...heatData} h={280} dark={dark}/>
              </ChartCard>
            )}

            {/* EXTRA: Scatter correlação (automático se tiver 2 cols numéricas) */}
            {scatterData&&(
              <ChartCard title={`Dispersão — ${scatterData.xName} × ${scatterData.yName}`} h={280}>
                <ScatterChart {...scatterData} h={280} dark={dark}/>
              </ChartCard>
            )}

            {/* EXTRA: Waterfall saving por categoria */}
            {waterfallData&&waterfallData.cats.length>2&&(
              <ChartCard title={`Saving por ${cols[grpCI]?.name||'Categoria'}`} h={280}>
                <WaterfallChart categories={waterfallData.cats} values={waterfallData.vals} h={280} dark={dark}/>
              </ChartCard>
            )}

            {/* EXTRA: Treemap top N se disponível */}
            {treemapData&&g4.type!=='treemap'&&(
              <ChartCard title={`Treemap — ${cols[ci(g4.labelCol)]?.name||'Distribuição'}`} h={280}>
                <TreemapChart {...treemapData} h={280} dark={dark}/>
              </ChartCard>
            )}

          </div>
        )}

        {/* Summary table */}
        {sections.summary!==false&&summaryData.length>0&&(
          <div className="rounded-2xl p-4 mb-5 shadow-sm" style={{background:cardBg,border:`1px solid ${bdColor}`}}>
            <div className="text-xs font-bold uppercase tracking-wider mb-3 pb-2" style={{color:p2,borderBottom:`1px solid ${bdColor}`}}>
              🗂 Resumo por {cols[grpCI]?.name||'—'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{background:p1,color:'#fff'}}>
                    <th className="px-3 py-2 text-left font-semibold">{cols[grpCI]?.name}</th>
                    <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                    {v1CI>=0&&<th className="px-3 py-2 text-right font-semibold">{cols[v1CI]?.name}</th>}
                    {v2CI>=0&&<th className="px-3 py-2 text-right font-semibold">{cols[v2CI]?.name}</th>}
                  </tr>
                </thead>
                <tbody>
                  {summaryData.map(([k,v],i)=>(
                    <tr key={i} style={{background:i%2===0?(dark?'rgba(255,255,255,0.02)':'#f8fafc'):'transparent'}}>
                      <td className="px-3 py-1.5">{k}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{v.n.toLocaleString('pt-BR')}</td>
                      {v1CI>=0&&<td className="px-3 py-1.5 text-right font-mono">{fmtBRL(v.v1)}</td>}
                      {v2CI>=0&&<td className="px-3 py-1.5 text-right font-mono">{fmtBRL(v.v2)}</td>}
                    </tr>
                  ))}
                  <tr style={{background:dark?'rgba(255,255,255,0.05)':'#e2e8f0',fontWeight:'bold',borderTop:`2px solid ${bdColor}`}}>
                    <td className="px-3 py-2">TOTAL GERAL</td>
                    <td className="px-3 py-2 text-right font-mono">{rows.length.toLocaleString('pt-BR')}</td>
                    {v1CI>=0&&<td className="px-3 py-2 text-right font-mono">{fmtBRL(sumCol(v1CI))}</td>}
                    {v2CI>=0&&<td className="px-3 py-2 text-right font-mono">{fmtBRL(sumCol(v2CI))}</td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Main Table */}
        {sections.table!==false&&visCols.length>0&&(
          <TableSection rows={rows} visCols={visCols} cols={cols} dark={dark} cardBg={cardBg} bdColor={bdColor} p1={p1} p2={p2} textColor={textColor} subText={subText} showFilters={sections.filters!==false}/>
        )}

        {/* Footer */}
        {sections.footer!==false&&(
          <div className="rounded-2xl px-5 py-3 text-center text-xs" style={{background:p1,color:'rgba(255,255,255,.5)'}}>
            {state.footer||'Relatório gerado pelo Report Studio'} · {new Date().toLocaleDateString('pt-BR')}
          </div>
        )}

      </div>
    </div>
  )
}

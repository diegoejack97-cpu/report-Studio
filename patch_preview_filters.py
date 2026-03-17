with open('frontend/src/components/editor/ReportPreview.jsx', 'r') as f:
    c = f.read()

# Verifica se já está aplicado
if 'TableSection' in c and 'categoricalCols' in c:
    print("Patch já aplicado!")
    exit()

old_import = """import { useRef, useEffect, useMemo, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { motion } from 'motion/react'
import { useThemeStore } from '@/store/themeStore'"""

new_import = """import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { motion } from 'motion/react'
import { useThemeStore } from '@/store/themeStore'

function TableSection({ rows, visCols, cols, dark, cardBg, bdColor, p1, p2, textColor, subText }) {
  const [colFilters, setColFilters] = useState({})
  const [globalSearch, setGlobalSearch] = useState('')
  const categoricalCols = (visCols || []).map(vc => {
    const vals = [...new Set(rows.map(r => String(r.cells?.[vc.i] ?? '').trim()).filter(Boolean))].sort()
    return vals.length >= 2 && vals.length <= 40 ? { ...vc, vals } : null
  }).filter(Boolean)
  let filteredRows = rows
  if (globalSearch.trim()) {
    const q = globalSearch.toLowerCase()
    filteredRows = filteredRows.filter(r => r.cells?.some(c => String(c).toLowerCase().includes(q)))
  }
  Object.entries(colFilters).forEach(([colI, val]) => {
    if (!val) return
    filteredRows = filteredRows.filter(r => String(r.cells?.[Number(colI)] ?? '') === val)
  })
  const activeFilters = Object.values(colFilters).filter(Boolean).length
  const hasFilter = globalSearch || activeFilters > 0
  const inputStyle = { background:dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)', border:`1px solid ${bdColor}`, borderRadius:6, color:textColor, fontSize:'0.72rem', padding:'0.25rem 0.5rem', outline:'none', width:'100%' }
  return (
    <div className="rounded-2xl shadow-sm overflow-hidden mb-5" style={{background:cardBg,border:`1px solid ${bdColor}`}}>
      <div className="px-4 py-3 flex items-center justify-between" style={{borderBottom:`1px solid ${bdColor}`}}>
        <span className="text-xs font-bold uppercase tracking-wider" style={{color:p2}}>
          Todos os Registros — {hasFilter ? `${filteredRows.length} de ${rows.length}` : rows.length.toLocaleString('pt-BR')}
        </span>
        {hasFilter && <button onClick={() => { setColFilters({}); setGlobalSearch('') }} style={{fontSize:'0.7rem',color:'#f87171',background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.3)',borderRadius:5,padding:'0.15rem 0.5rem'}}>x Limpar</button>}
      </div>
      <div className="px-4 py-3" style={{borderBottom:`1px solid ${bdColor}`,background:dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.02)'}}>
        <input style={{...inputStyle, marginBottom: categoricalCols.length?'0.6rem':0}} placeholder="Buscar em todos os campos..." value={globalSearch} onChange={e => setGlobalSearch(e.target.value)}/>
        {categoricalCols.length > 0 && (
          <div style={{display:'flex',flexWrap:'wrap',gap:'0.5rem',alignItems:'flex-end'}}>
            {categoricalCols.map(vc => {
              const active = !!colFilters[vc.i]
              return (
                <div key={vc.i} style={{display:'flex',flexDirection:'column',gap:2,minWidth:110}}>
                  <label style={{fontSize:'0.65rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',color:active?'#3b82f6':subText}}>{vc.name}</label>
                  <select style={{...inputStyle,borderColor:active?'#3b82f6':bdColor,appearance:'none',cursor:'pointer'}} value={colFilters[vc.i]||''} onChange={e => setColFilters(prev => ({...prev,[vc.i]:e.target.value}))}>
                    <option value="">Todos</option>
                    {vc.vals.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        )}
      </div>
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
}"""

old_table = """        {/* Main Table */}
        {sections.table!==false&&visCols.length>0&&(
          <div className="rounded-2xl shadow-sm overflow-hidden mb-5" style={{background:cardBg,border:`1px solid ${bdColor}`}}>
            <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{color:p2,borderBottom:`1px solid ${bdColor}`}}>
              🔍 Todos os Registros — {rows.length.toLocaleString('pt-BR')}
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0">
                  <tr style={{background:p1,color:'#fff'}}>
                    {visCols.map((c,i)=><th key={i} className="px-3 py-2 text-left font-semibold uppercase text-[10px] tracking-wider whitespace-nowrap">{c.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0,100).map((row,ri)=>(
                    <tr key={ri} style={{background:ri%2===0?(dark?'rgba(255,255,255,0.02)':'#f8fafc'):'transparent'}}>
                      {visCols.map((c,ci_)=><td key={ci_} className="px-3 py-1.5 whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis">{row.cells?.[c.i]??''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}"""

new_table = """        {/* Main Table */}
        {sections.table!==false&&visCols.length>0&&(
          <TableSection rows={rows} visCols={visCols} cols={cols} dark={dark} cardBg={cardBg} bdColor={bdColor} p1={p1} p2={p2} textColor={textColor} subText={subText}/>
        )}"""

if old_import not in c:
    print("ERRO: import nao encontrado")
elif old_table not in c:
    print("ERRO: tabela nao encontrada")
else:
    c = c.replace(old_import, new_import)
    c = c.replace(old_table, new_table)
    with open('frontend/src/components/editor/ReportPreview.jsx', 'w') as f:
        f.write(c)
    print("OK - filtros adicionados ao TODOS OS REGISTROS")

import { useState, useCallback, useMemo } from 'react'
import { Plus, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react'

const RENDER_LIMIT = 200

export default function DataTable({ state, update }) {
  const { cols = [], rows = [] } = state
  const [globalFilter, setGlobalFilter] = useState('')
  const [colFilters, setColFilters] = useState({})
  const [selRows, setSelRows] = useState(new Set())
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const categoricalCols = useMemo(() => {
    return cols.map((col, ci) => {
      const vals = [...new Set(rows.map(r => String(r.cells?.[ci] ?? '').trim()).filter(Boolean))].sort()
      return vals.length >= 2 && vals.length <= 40 ? { ci, col, vals } : null
    }).filter(Boolean)
  }, [cols, rows])

  const filteredIdxs = useMemo(() => {
    let idxs = rows.map((_, i) => i)
    if (globalFilter.trim()) {
      const q = globalFilter.toLowerCase()
      idxs = idxs.filter(i => rows[i].cells?.some(c => String(c).toLowerCase().includes(q)))
    }
    Object.entries(colFilters).forEach(([ci, val]) => {
      if (!val) return
      idxs = idxs.filter(i => String(rows[i].cells?.[Number(ci)] ?? '') === val)
    })
    if (sortCol !== null) {
      idxs.sort((a, b) => {
        const va = String(rows[a].cells?.[sortCol] ?? '')
        const vb = String(rows[b].cells?.[sortCol] ?? '')
        const n = parseFloat(va), m = parseFloat(vb)
        const cmp = !isNaN(n) && !isNaN(m) ? n - m : va.localeCompare(vb, 'pt-BR')
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return idxs
  }, [rows, globalFilter, colFilters, sortCol, sortDir])

  const activeFilters = Object.values(colFilters).filter(Boolean).length
  const clearAll = () => { setGlobalFilter(''); setColFilters({}) }
  const setColFilter = (ci, val) => setColFilters(prev => ({ ...prev, [ci]: val }))
  const toggleSort = (ci) => {
    if (sortCol === ci) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(ci); setSortDir('asc') }
  }
  const toggle = (idx) => setSelRows(prev => {
    const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n
  })
  const delSelected = () => {
    if (!selRows.size) return
    if (!confirm(`Excluir ${selRows.size} linha(s)?`)) return
    update(s => ({ ...s, rows: s.rows.filter((_, i) => !selRows.has(i)) }))
    setSelRows(new Set())
  }
  const addRow = () => update(s => ({ ...s, rows: [...s.rows, { cells: s.cols.map(() => '') }] }))
  const editCell = useCallback((ri, ci, val) => {
    update(s => {
      const rows = s.rows.map((r, i) => i === ri ? { ...r, cells: r.cells.map((c, j) => j === ci ? val : c) } : r)
      return { ...s, rows }
    })
  }, [])
  const renameCol = (ci, name) => update(s => ({ ...s, cols: s.cols.map((c, i) => i === ci ? { ...c, name } : c) }))
  const delCol = (ci) => {
    if (!confirm(`Excluir coluna "${cols[ci]?.name}"?`)) return
    update(s => ({ ...s, cols: s.cols.filter((_, i) => i !== ci), rows: s.rows.map(r => ({ ...r, cells: r.cells.filter((_, i) => i !== ci) })) }))
  }

  const showing = filteredIdxs.slice(0, RENDER_LIMIT)
  const total = rows.length, filtered = filteredIdxs.length
  const hasActiveFilter = globalFilter || activeFilters > 0

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="border-b" style={{background:'var(--s0)',borderColor:'var(--bd)'}}>
        <div className="px-3 pt-2 pb-1">
          <input className="input-field py-1.5 text-xs w-full" placeholder="Buscar em todos os campos..." value={globalFilter} onChange={e => setGlobalFilter(e.target.value)} />
        </div>
        {categoricalCols.length > 0 && (
          <div className="px-3 pb-2 flex flex-wrap gap-2 items-end">
            {categoricalCols.map(({ ci, col, vals }) => {
              const active = !!colFilters[ci]
              return (
                <div key={ci} className="flex flex-col gap-0.5" style={{minWidth:110}}>
                  <label className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{color:active?'#2563eb':'var(--ts)'}}>{col.name}</label>
                  <div className="relative">
                    <select className="input-field py-1 pr-6 text-xs appearance-none w-full" style={active?{borderColor:'#2563eb',color:'var(--tp)'}:{color:'var(--tp)'}} value={colFilters[ci]||''} onChange={e => setColFilter(ci, e.target.value)}>
                      <option value="">Todos</option>
                      {vals.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    {active && <button onClick={() => setColFilter(ci,'')} className="absolute right-1 top-1/2 -translate-y-1/2 text-red-400 text-xs" title="Limpar">x</button>}
                  </div>
                </div>
              )
            })}
            <div className="flex flex-col justify-end gap-0.5 ml-auto">
              <span className="text-[10px]" style={{color:'var(--ts)'}}>{hasActiveFilter ? `${filtered} de ${total} registros` : `${total} registros`}</span>
              {hasActiveFilter && <button onClick={clearAll} className="flex items-center gap-1 text-xs text-red-400"><X className="w-3 h-3"/>Limpar</button>}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b" style={{borderColor:'var(--bd)'}}>
        <button onClick={addRow} className="btn-ghost py-1 px-2 text-xs flex items-center gap-1"><Plus className="w-3 h-3"/>Linha</button>
        <button onClick={delSelected} disabled={!selRows.size} className="btn-ghost py-1 px-2 text-xs text-red-400 disabled:opacity-30 flex items-center gap-1"><Trash2 className="w-3 h-3"/>Excluir sel.</button>
        {activeFilters > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{background:'rgba(37,99,235,0.2)',color:'#60a5fa'}}>{activeFilters} filtro{activeFilters>1?'s':''} ativo{activeFilters>1?'s':''}</span>}
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 w-8 border p-1 text-center" style={{background:'var(--s2)',borderColor:'var(--bd)'}}>
                <input type="checkbox" className="w-3 h-3" onChange={e => setSelRows(e.target.checked ? new Set(rows.map((_,i)=>i)) : new Set())}/>
              </th>
              {cols.map((col,ci) => (
                <th key={ci} className="sticky top-0 z-10 border p-0" style={{background:'var(--s2)',borderColor:'var(--bd)',minWidth:90}}>
                  <div className="flex items-center group">
                    <input className="bg-transparent border-none font-semibold px-2 py-1.5 w-full outline-none text-xs" style={{color:'var(--tp)'}} value={col.name} onChange={e => renameCol(ci, e.target.value)}/>
                    <button onClick={() => toggleSort(ci)} className="p-1 flex-shrink-0" style={sortCol===ci?{color:'#2563eb'}:{color:'var(--tm)',opacity:0.35}}>
                      {sortCol===ci?(sortDir==='asc'?<ChevronUp className="w-3 h-3"/>:<ChevronDown className="w-3 h-3"/>):<ChevronUp className="w-3 h-3"/>}
                    </button>
                    <button onClick={() => delCol(ci)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 flex-shrink-0">x</button>
                  </div>
                </th>
              ))}
              <th className="sticky top-0 z-10 border" style={{background:'var(--s2)',borderColor:'var(--bd)'}}>
                <button onClick={() => update(s => ({...s, cols:[...s.cols,{name:'Nova',type:'text',vis:true,w:100}], rows:s.rows.map(r=>({...r,cells:[...r.cells,'']}))}))} className="px-3 text-lg leading-none py-1" style={{color:'var(--tm)'}}>+</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {showing.map(ri => {
              const row = rows[ri]
              return (
                <tr key={ri} style={selRows.has(ri)?{background:'rgba(37,99,235,0.15)'}:{}}>
                  <td className="border text-center" style={{background:'var(--s1)',borderColor:'var(--bd)'}}>
                    <span className="cursor-pointer block px-1 py-1.5 text-[10px] font-mono select-none" style={{color:'var(--tm)'}} onClick={() => toggle(ri)}>{ri+1}</span>
                  </td>
                  {row?.cells?.map((cell,ci) => (
                    <td key={ci} className="border p-0" style={{borderColor:'var(--bd)'}}>
                      <input className="bg-transparent px-2 py-1.5 w-full outline-none text-xs" style={{color:'var(--tp)',minWidth:80}} value={cell} onChange={e => editCell(ri,ci,e.target.value)} onFocus={e => e.target.style.background='rgba(37,99,235,0.1)'} onBlur={e => e.target.style.background='transparent'}/>
                    </td>
                  ))}
                  <td className="border" style={{borderColor:'var(--bd)'}}/>
                </tr>
              )
            })}
          </tbody>
        </table>
        {showing.length < filtered && <div className="text-center text-xs py-2" style={{color:'var(--tm)'}}>Exibindo {showing.length} de {filtered} · todas entram no relatório</div>}
      </div>
    </div>
  )
}

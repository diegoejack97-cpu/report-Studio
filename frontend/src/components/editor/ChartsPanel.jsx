import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="panel-2d rounded-xl overflow-hidden mb-2">
      <button onClick={() => setOpen(o => !o)}
        className="card-clickable w-full flex items-center justify-between px-3 py-2.5 rounded-none border-x-0 border-t-0 text-xs font-bold uppercase tracking-wider"
        style={{background:'var(--s2)',color:'var(--ts)'}}>
        {title}
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="px-3 py-3 space-y-3" style={{background:'var(--s1)'}}>{children}</div>}
    </div>
  )
}

function Field({ label, children }) {
  return <div><label className="text-[10px] font-medium block mb-1" style={{color:'var(--tm)'}}>{label}</label>{children}</div>
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-xs" style={{color:'var(--ts)'}}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="toggle-2d relative inline-flex items-center px-[2px]"
        data-state={checked ? 'checked' : 'unchecked'}
      >
        <span className="toggle-2d-thumb" />
      </button>
    </label>
  )
}

export default function ChartsPanel({ state, update }) {
  const { cols = [], charts: ch = {} } = state
  const colOpts = cols.map((c, i) => ({ value: String(i), label: c.name }))
  const numOpts  = colOpts.filter((_, i) => !cols[i]?.type || ['number', 'monetary', 'percent'].includes(cols[i]?.type))

  const setG = (g, k, v) => update(s => ({ ...s, charts: { ...s.charts, [g]: { ...s.charts?.[g], [k]: v } } }))

  function ColSelect({ gid, field, label, opts }) {
    const val = ch[gid]?.[field] ?? ''
    return (
      <Field label={label}>
        <select className="input-field text-xs py-2 sm:py-1.5" value={val} onChange={e => setG(gid, field, e.target.value)}>
          <option value="">— escolha —</option>
          {(opts||colOpts).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
    )
  }

  function ChartBlock({ id, prefix, label, typeOptions, children }) {
    const g = ch[id] || {}
    return (
      <Accordion title={`${prefix ? `${prefix} ` : ''}${label}`}>
        <Toggle checked={g.on !== false} onChange={v => setG(id, 'on', v)} label="Mostrar" />
        <Field label="Título">
          <input className="input-field text-xs py-2 sm:py-1.5" value={g.title || ''} onChange={e => setG(id, 'title', e.target.value)} />
        </Field>
        <Field label="Tipo de gráfico">
          <select className="input-field text-xs py-2 sm:py-1.5" value={g.type || typeOptions[0]?.value} onChange={e => setG(id, 'type', e.target.value)}>
            {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        {children}
        <Field label="Altura (px)">
          <input type="number" className="input-field text-xs py-2 sm:py-1.5" value={g.h || 260} min={120} max={700} step={20}
            onChange={e => setG(id, 'h', parseInt(e.target.value) || 260)} />
        </Field>
      </Accordion>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <p className="text-[10px] mb-3 px-1" style={{color:'var(--tm)'}}>
        Gráficos gerados 100% com seus dados reais. Heatmap, Scatter e Waterfall aparecem automaticamente quando detectados.
      </p>

      {/* G1 */}
      <ChartBlock id="g1" prefix="G1" label="Gráfico 1 — Distribuição" typeOptions={[
        {value:'doughnut',   label:'Donut'},
        {value:'pie',        label:'Pizza'},
        {value:'nightingale',label:'Nightingale (Rose)'},
        {value:'bar',        label:'Barras verticais'},
        {value:'hbar',       label:'Barras horizontais'},
        {value:'treemap',    label:'Treemap'},
        {value:'funnel',     label:'Funil'},
      ]}>
        <ColSelect gid="g1" field="col" label="Coluna de categoria" />
      </ChartBlock>

      {/* G2 */}
      <ChartBlock id="g2" prefix="G2" label="Gráfico 2 — Por Categoria" typeOptions={[
        {value:'bar',   label:'Barras verticais'},
        {value:'hbar',  label:'Barras horizontais'},
        {value:'line',  label:'Linha'},
        {value:'area',  label:'Área'},
        {value:'radar', label:'Radar'},
        {value:'funnel',label:'Funil'},
      ]}>
        <ColSelect gid="g2" field="col" label="Coluna de categoria" />
      </ChartBlock>

      {/* G3 */}
      <ChartBlock id="g3" prefix="G3" label="Gráfico 3 — Temporal" typeOptions={[
        {value:'area', label:'Área (recomendado)'},
        {value:'line', label:'Linha'},
        {value:'bar',  label:'Barras'},
      ]}>
        <ColSelect gid="g3" field="dateCol" label="Coluna de DATA" />
        <ColSelect gid="g3" field="v1Col"   label="Valor 1 — linha principal" opts={numOpts} />
        <ColSelect gid="g3" field="v2Col"   label="Valor 2 — linha opcional"  opts={numOpts} />
      </ChartBlock>

      {/* G4 */}
      <ChartBlock id="g4" prefix="G4" label="Gráfico 4 — Top N por Valor" typeOptions={[
        {value:'hbar',    label:'Barras horizontais'},
        {value:'bar',     label:'Barras verticais'},
        {value:'doughnut',label:'Donut'},
        {value:'treemap', label:'Treemap'},
        {value:'funnel',  label:'Funil'},
      ]}>
        <ColSelect gid="g4" field="labelCol" label="Coluna de rótulo" />
        <ColSelect gid="g4" field="valCol"   label="Coluna de valor (soma)" opts={numOpts} />
        <Field label="Top N">
          <input type="number" className="input-field text-xs py-2 sm:py-1.5" value={ch.g4?.n||10} min={3} max={50}
            onChange={e => setG('g4','n',parseInt(e.target.value)||10)} />
        </Field>
      </ChartBlock>

      {/* Info sobre gráficos automáticos */}
      <div className="panel-2d rounded-xl p-3 mt-1" style={{background:'var(--s2)'}}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color:'var(--ts)'}}>
          Gráficos automáticos
        </div>
        <div className="space-y-1.5 text-[10px]" style={{color:'var(--tm)'}}>
          <div><strong style={{color:'var(--ts)'}}>Heatmap</strong> — cruzamento de 2 colunas categóricas</div>
          <div><strong style={{color:'var(--ts)'}}>Dispersão</strong> — correlação entre 2 colunas numéricas</div>
          <div><strong style={{color:'var(--ts)'}}>Waterfall</strong> — saving por categoria (requer saving + agrupamento)</div>
          <div><strong style={{color:'var(--ts)'}}>Treemap extra</strong> — visão alternativa do Top N</div>
        </div>
      </div>
    </div>
  )
}

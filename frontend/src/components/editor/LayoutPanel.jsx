import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react'

function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-white/[0.07] rounded-lg overflow-hidden mb-2">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2.5 bg-surface-2 hover:bg-surface-3 text-xs font-bold text-ink-300 uppercase tracking-wider transition-colors">
        {title}
        {open ? <ChevronDown className="w-3.5 h-3.5 text-ink-500" /> : <ChevronRight className="w-3.5 h-3.5 text-ink-500" />}
      </button>
      {open && <div className="px-3 py-3 bg-surface-1 space-y-3">{children}</div>}
    </div>
  )
}

function Field({ label, children }) {
  return <div><label className="text-[10px] text-ink-500 font-medium block mb-1">{label}</label>{children}</div>
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-xs text-ink-300">{label}</span>
      <div className={`w-8 h-4 rounded-full relative transition-colors ${checked ? 'bg-brand-600' : 'bg-surface-4'}`} onClick={() => onChange(!checked)}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </label>
  )
}

export default function LayoutPanel({ state, update }) {
  const { cols = [], kpis = [], colors = {}, sections = {}, saving: savCfg = {}, exportOptions = {} } = state
  const metricMapping = state.reportData?.mapping || {}

  const setTitle = v => update({ title: v })
  const setSub = v => update({ subtitle: v })
  const setPeriod = v => update({ period: v })
  const setCo = v => update({ company: v })
  const setSection = (k, v) => update(s => ({ ...s, sections: { ...s.sections, [k]: v } }))
  const setColor = (k, v) => update(s => ({ ...s, colors: { ...s.colors, [k]: v } }))
  const setSav = (k, v) => update(s => ({ ...s, saving: { ...s.saving, [k]: v } }))
  const setExportOpt = (k, v) => update(s => ({ ...s, exportOptions: { ...(s.exportOptions || {}), [k]: v } }))
  const currentMetricType = savCfg.metricType || savCfg.type || 'ECONOMIA'

  const addKPI = () => update(s => ({ ...s, kpis: [...s.kpis, { label: 'KPI', col: '', fmt: 'count', icon: 'bar', color: '#3b82f6' }] }))
  const updKPI = (i, k, v) => update(s => ({ ...s, kpis: s.kpis.map((kpi, idx) => idx === i ? { ...kpi, [k]: v } : kpi) }))
  const delKPI = (i) => update(s => ({ ...s, kpis: s.kpis.filter((_, idx) => idx !== i) }))

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <Accordion title="Cabeçalho" defaultOpen>
        <Field label="Título"><input className="input-field text-xs py-1.5" value={state.title || ''} onChange={e => setTitle(e.target.value)} /></Field>
        <Field label="Subtítulo"><input className="input-field text-xs py-1.5" value={state.subtitle || ''} onChange={e => setSub(e.target.value)} /></Field>
        <Field label="Período"><input className="input-field text-xs py-1.5" value={state.period || ''} onChange={e => setPeriod(e.target.value)} /></Field>
        <Field label="Empresa"><input className="input-field text-xs py-1.5" value={state.company || ''} onChange={e => setCo(e.target.value)} /></Field>
      </Accordion>

      <Accordion title="Métrica principal">
        <Toggle checked={sections.saving !== false} onChange={v => setSection('saving', v)} label="Mostrar banner" />
        <Field label="Rótulo"><input className="input-field text-xs py-1.5" value={savCfg.label || ''} onChange={e => setSav('label', e.target.value)} /></Field>
        <Field label="Tipo de métrica">
          <select className="input-field text-xs py-1.5" value={currentMetricType} onChange={e => setSav('metricType', e.target.value)}>
            <option value="ECONOMIA">Economia</option>
            <option value="TOTAL">Total Financeiro</option>
            <option value="VARIACAO">Variação</option>
            <option value="TAXA">Taxa</option>
            <option value="VOLUME">Volume</option>
          </select>
        </Field>
        <div className="rounded-lg p-2.5 text-[11px] border border-white/[0.08] bg-surface-2 text-ink-400">
          O mapeamento das colunas e o cálculo da métrica principal são definidos automaticamente pelo backend.
        </div>
        <div className="rounded-lg p-2.5 text-[11px] border border-white/[0.08] bg-surface-2 text-ink-300 space-y-1">
          <div>Monetária: <span className="font-semibold">{metricMapping.monetary || 'Não identificado'}</span></div>
          <div>Percentual: <span className="font-semibold">{metricMapping.percent || 'Não identificado'}</span></div>
          <div>Categoria: <span className="font-semibold">{metricMapping.category || 'Não identificado'}</span></div>
        </div>
      </Accordion>

      <Accordion title="KPIs">
        <div className="space-y-2">
          {kpis.map((k, i) => (
            <div key={i} className="bg-surface-2 border border-white/[0.07] rounded-lg p-2 space-y-1.5">
              <div className="flex gap-1.5">
                <input className="input-field text-xs py-1 flex-1" value={k.label} onChange={e => updKPI(i, 'label', e.target.value)} placeholder="Rótulo" />
                <input className="input-field text-xs py-1 w-9 text-center" value={k.icon} onChange={e => updKPI(i, 'icon', e.target.value)} />
                <input type="color" className="w-8 h-7 rounded cursor-pointer bg-transparent border-0" value={k.color || '#3b82f6'} onChange={e => updKPI(i, 'color', e.target.value)} />
                <button onClick={() => delKPI(i)} className="text-red-400 hover:text-red-300 px-1"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex gap-1.5">
                <select className="input-field text-xs py-1 flex-1" value={k.col ?? ''} onChange={e => updKPI(i, 'col', e.target.value)}>
                  <option value="">Total registros</option>
                  {cols.map((c, ci) => <option key={ci} value={String(ci)}>{c.name}</option>)}
                </select>
                <select className="input-field text-xs py-1 flex-1" value={k.fmt} onChange={e => updKPI(i, 'fmt', e.target.value)}>
                  <option value="count">Contagem</option>
                  <option value="countuniq">Únicos</option>
                  <option value="sum">Soma Σ</option>
                  <option value="avg">Média x̄</option>
                  <option value="max">Máximo</option>
                  <option value="min">Mínimo</option>
                  <option value="topval">Mais comum</option>
                </select>
              </div>
            </div>
          ))}
          <button onClick={addKPI} className="w-full py-1.5 rounded-lg border border-dashed border-white/[0.12] text-ink-500 hover:text-ink-300 text-xs flex items-center justify-center gap-1">
            <Plus className="w-3 h-3" /> Adicionar KPI
          </button>
        </div>
      </Accordion>

      <Accordion title="Cores">
        {[['primary','Cor primária'], ['secondary','Cor secundária'], ['accent','Destaque/saving'], ['bg','Background'], ['text','Texto']].map(([k, label]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-xs text-ink-400 flex-1">{label}</span>
            <input type="color" className="w-8 h-7 rounded cursor-pointer" value={colors[k] || '#000000'} onChange={e => setColor(k, e.target.value)} />
          </div>
        ))}
      </Accordion>

      <Accordion title="⚙ Seções visíveis">
        {[['saving','Banner saving'], ['kpi','KPIs'], ['charts','Gráficos'], ['summary','Resumo categoria'], ['table','Tabela de dados'], ['filters','Filtros'], ['footer','Rodapé']].map(([k, label]) => (
          <Toggle key={k} checked={sections[k] !== false} onChange={v => setSection(k, v)} label={label} />
        ))}
      </Accordion>

      <Accordion title="Rodapé">
        <textarea className="input-field text-xs py-1.5 resize-y" rows={2} value={state.footer || ''} onChange={e => update({ footer: e.target.value })} />
      </Accordion>

      <Accordion title="Exportação HTML">
        <Toggle
          checked={exportOptions.strictParity !== false}
          onChange={v => setExportOpt('strictParity', v)}
          label="Modo estrito (igual ao preview)"
        />
        <Field label="Tema do export">
          <select
            className="input-field text-xs py-1.5"
            value={exportOptions.themeMode || 'follow'}
            onChange={e => setExportOpt('themeMode', e.target.value)}
          >
            <option value="follow">Seguir tema atual do sistema</option>
            <option value="ask">Perguntar na exportação</option>
            <option value="dark">Sempre escuro</option>
            <option value="light">Sempre claro</option>
          </select>
        </Field>
        <p className="text-[10px] text-ink-500">
          Com modo estrito, o HTML exportado mantém a mesma base visual e limites de renderização do preview.
        </p>
      </Accordion>
    </div>
  )
}

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react'

function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-theme rounded-lg overflow-hidden mb-2">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--s2)] hover:bg-[var(--s3)] text-xs font-bold text-[color:var(--ts)] uppercase tracking-wider transition-colors">
        {title}
        {open ? <ChevronDown className="w-3.5 h-3.5 text-[color:var(--tm)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[color:var(--tm)]" />}
      </button>
      {open && <div className="px-3 py-3 bg-[var(--s1)] space-y-3">{children}</div>}
    </div>
  )
}

function Field({ label, children }) {
  return <div><label className="text-[10px] text-[color:var(--tm)] font-medium block mb-1">{label}</label>{children}</div>
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-xs text-[color:var(--ts)]">{label}</span>
      <div className={`w-10 h-5 rounded-full relative transition-colors ${checked ? 'bg-brand-600' : 'bg-[var(--s4)]'}`} onClick={() => onChange(!checked)}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
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
    <div className="flex-1 overflow-y-auto p-2 sm:p-2.5">
      <Accordion title="Cabeçalho" defaultOpen>
        <Field label="Título"><input className="input-field text-xs py-2 sm:py-1.5" value={state.title || ''} onChange={e => setTitle(e.target.value)} /></Field>
        <Field label="Subtítulo"><input className="input-field text-xs py-2 sm:py-1.5" value={state.subtitle || ''} onChange={e => setSub(e.target.value)} /></Field>
        <Field label="Período"><input className="input-field text-xs py-2 sm:py-1.5" value={state.period || ''} onChange={e => setPeriod(e.target.value)} /></Field>
        <Field label="Empresa"><input className="input-field text-xs py-2 sm:py-1.5" value={state.company || ''} onChange={e => setCo(e.target.value)} /></Field>
      </Accordion>

      <Accordion title="Métrica principal">
        <Toggle checked={sections.saving !== false} onChange={v => setSection('saving', v)} label="Mostrar banner" />
        <Field label="Rótulo"><input className="input-field text-xs py-2 sm:py-1.5" value={savCfg.label || ''} onChange={e => setSav('label', e.target.value)} /></Field>
        <Field label="Tipo de métrica">
          <select className="input-field text-xs py-2 sm:py-1.5" value={currentMetricType} onChange={e => setSav('metricType', e.target.value)}>
            <option value="ECONOMIA">Economia</option>
            <option value="TOTAL">Total Financeiro</option>
            <option value="VARIACAO">Variação</option>
            <option value="TAXA">Taxa</option>
            <option value="VOLUME">Volume</option>
          </select>
        </Field>
        <div className="rounded-lg p-2.5 text-[11px] border border-theme bg-[var(--s2)] text-[color:var(--ts)]">
          O mapeamento das colunas e o cálculo da métrica principal são definidos automaticamente pelo backend.
        </div>
        <div className="rounded-lg p-2.5 text-[11px] border border-theme bg-[var(--s2)] text-[color:var(--tp)] space-y-1">
          <div>Monetária: <span className="font-semibold">{metricMapping.monetary || 'Não identificado'}</span></div>
          <div>Percentual: <span className="font-semibold">{metricMapping.percent || 'Não identificado'}</span></div>
          <div>Categoria: <span className="font-semibold">{metricMapping.category || 'Não identificado'}</span></div>
        </div>
      </Accordion>

      <Accordion title="KPIs">
        <div className="space-y-2">
          {kpis.map((k, i) => (
            <div key={i} className="bg-[var(--s2)] border border-theme rounded-lg p-2 space-y-1.5">
              <div className="flex flex-wrap sm:flex-nowrap gap-1.5">
                <input className="input-field text-xs py-2 sm:py-1 flex-1 min-w-[140px]" value={k.label} onChange={e => updKPI(i, 'label', e.target.value)} placeholder="Rótulo" />
                <input className="input-field text-xs py-2 sm:py-1 w-14 sm:w-9 text-center" value={k.icon} onChange={e => updKPI(i, 'icon', e.target.value)} />
                <input type="color" className="w-10 h-9 sm:w-8 sm:h-7 rounded cursor-pointer bg-transparent border-0" value={k.color || '#3b82f6'} onChange={e => updKPI(i, 'color', e.target.value)} />
                <button onClick={() => delKPI(i)} className="text-red-400 hover:text-red-300 px-2 min-h-[36px]"><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex flex-col sm:flex-row gap-1.5">
                <select className="input-field text-xs py-2 sm:py-1 flex-1" value={k.col ?? ''} onChange={e => updKPI(i, 'col', e.target.value)}>
                  <option value="">Total registros</option>
                  {cols.map((c, ci) => <option key={ci} value={String(ci)}>{c.name}</option>)}
                </select>
                <select className="input-field text-xs py-2 sm:py-1 flex-1" value={k.fmt} onChange={e => updKPI(i, 'fmt', e.target.value)}>
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
          <button onClick={addKPI} className="w-full py-2 rounded-lg border border-dashed border-theme text-[color:var(--tm)] hover:text-[color:var(--tp)] text-xs flex items-center justify-center gap-1 min-h-[40px]">
            <Plus className="w-3 h-3" /> Adicionar KPI
          </button>
        </div>
      </Accordion>

      <Accordion title="Cores">
        {[['primary','Cor primária'], ['secondary','Cor secundária'], ['accent','Destaque/saving'], ['bg','Background'], ['text','Texto']].map(([k, label]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-xs text-[color:var(--ts)] flex-1">{label}</span>
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
        <textarea className="input-field text-xs py-2 sm:py-1.5 resize-y" rows={2} value={state.footer || ''} onChange={e => update({ footer: e.target.value })} />
      </Accordion>

      <Accordion title="Exportação HTML">
        <Toggle
          checked={exportOptions.strictParity !== false}
          onChange={v => setExportOpt('strictParity', v)}
          label="Modo estrito (igual ao preview)"
        />
        <Field label="Tema do export">
          <select
            className="input-field text-xs py-2 sm:py-1.5"
            value={exportOptions.themeMode || 'follow'}
            onChange={e => setExportOpt('themeMode', e.target.value)}
          >
            <option value="follow">Seguir tema atual do sistema</option>
            <option value="ask">Perguntar na exportação</option>
            <option value="dark">Sempre escuro</option>
            <option value="light">Sempre claro</option>
          </select>
        </Field>
        <p className="text-[10px] text-[color:var(--tm)]">
          Com modo estrito, o HTML exportado mantém a mesma base visual e limites de renderização do preview.
        </p>
      </Accordion>
    </div>
  )
}

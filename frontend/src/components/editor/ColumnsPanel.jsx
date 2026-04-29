export default function ColumnsPanel({ state, update }) {
  const { cols = [] } = state

  const setVis = (i, v) => update(s => ({ ...s, cols: s.cols.map((c, ci) => ci === i ? { ...c, vis: v } : c) }))
  const setW = (i, w) => update(s => ({ ...s, cols: s.cols.map((c, ci) => ci === i ? { ...c, w: parseInt(w) || 120 } : c) }))
  const allOn = () => update(s => ({ ...s, cols: s.cols.map(c => ({ ...c, vis: true })) }))
  const allOff = () => update(s => ({ ...s, cols: s.cols.map(c => ({ ...c, vis: false })) }))

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex gap-2 mb-3">
        <button onClick={allOn} className="btn-ghost py-1 px-2 text-xs">✓ Todas</button>
        <button onClick={allOff} className="btn-ghost py-1 px-2 text-xs">✗ Nenhuma</button>
      </div>

      <div className="mb-4">
        <p className="text-[10px] text-ink-500 font-semibold uppercase tracking-wider mb-2">Visibilidade no relatório</p>
        <div className="space-y-1">
          {cols.map((col, i) => (
            <label key={i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-surface-2 cursor-pointer group">
              <div
                onClick={() => setVis(i, !col.vis)}
                className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${col.vis !== false ? 'bg-brand-600' : 'bg-surface-4'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${col.vis !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs text-ink-300 flex-1 truncate">{col.name}</span>
              <span className="text-[10px] text-ink-600 font-mono px-1 py-0.5 bg-surface-3 rounded">{col.type}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="text-[10px] text-ink-500 font-semibold uppercase tracking-wider mb-2">Largura (px)</p>
        <div className="space-y-1">
          {cols.map((col, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="text-xs text-ink-400 flex-1 truncate">{col.name}</span>
              <input
                type="number"
                className="input-field text-xs py-1 w-16 text-center font-mono"
                value={col.w || 120}
                min={40} max={600} step={10}
                onChange={e => setW(i, e.target.value)}
              />
              <span className="text-[10px] text-ink-600">px</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-surface-2 p-2.5">
        <p className="text-[10px] text-ink-500 font-semibold uppercase tracking-wider mb-1">Agrupamento do resumo</p>
        <p className="text-[11px] text-ink-400">
          O agrupamento do resumo é definido automaticamente pelo backend para manter consistência do cálculo.
        </p>
      </div>
    </div>
  )
}

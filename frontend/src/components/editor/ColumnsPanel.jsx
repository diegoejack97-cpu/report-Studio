export default function ColumnsPanel({ state, update }) {
  const { cols = [] } = state

  const setVis = (i, v) => update(s => ({ ...s, cols: s.cols.map((c, ci) => ci === i ? { ...c, vis: v } : c) }))
  const setW = (i, w) => update(s => ({ ...s, cols: s.cols.map((c, ci) => ci === i ? { ...c, w: parseInt(w) || 120 } : c) }))
  const allOn = () => update(s => ({ ...s, cols: s.cols.map(c => ({ ...c, vis: true })) }))
  const allOff = () => update(s => ({ ...s, cols: s.cols.map(c => ({ ...c, vis: false })) }))

  return (
    <div className="flex-1 overflow-y-auto p-2.5 sm:p-3">
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={allOn} className="btn-ghost py-2 sm:py-1 px-2 text-xs min-h-[36px]">✓ Todas</button>
        <button onClick={allOff} className="btn-ghost py-2 sm:py-1 px-2 text-xs min-h-[36px]">✗ Nenhuma</button>
      </div>

      <div className="mb-4">
        <p className="text-[10px] text-ink-500 font-semibold uppercase tracking-wider mb-2">Visibilidade no relatório</p>
        <div className="space-y-1">
          {cols.map((col, i) => (
            <label key={i} className="card-clickable flex items-center gap-2 sm:gap-3 py-2 px-2 rounded-lg cursor-pointer group">
              <button
                type="button"
                role="switch"
                aria-checked={col.vis !== false}
                onClick={() => setVis(i, !col.vis)}
                className="toggle-2d relative inline-flex items-center px-[2px] flex-shrink-0"
                data-state={col.vis !== false ? 'checked' : 'unchecked'}
              >
                <span className="toggle-2d-thumb" />
              </button>
              <span className="text-xs text-[color:var(--ts)] flex-1 truncate">{col.name}</span>
              <span className="text-[10px] text-[color:var(--tm)] font-mono px-1 py-0.5 bg-[var(--s3)] rounded">{col.type}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="text-[10px] text-ink-500 font-semibold uppercase tracking-wider mb-2">Largura (px)</p>
        <div className="space-y-1">
          {cols.map((col, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5">
              <span className="text-xs text-[color:var(--ts)] flex-1 truncate">{col.name}</span>
              <input
                type="number"
                className="input-field text-xs py-2 sm:py-1 w-20 sm:w-16 text-center font-mono"
                value={col.w || 120}
                min={40} max={600} step={10}
                onChange={e => setW(i, e.target.value)}
              />
              <span className="text-[10px] text-[color:var(--tm)]">px</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rf-panel p-2.5">
        <p className="text-[10px] text-ink-500 font-semibold uppercase tracking-wider mb-1">Agrupamento do resumo</p>
        <p className="text-[11px] text-[color:var(--ts)]">
          O agrupamento do resumo é definido automaticamente pelo backend para manter consistência do cálculo.
        </p>
      </div>
    </div>
  )
}

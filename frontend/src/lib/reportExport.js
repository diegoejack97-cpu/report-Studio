import { buildMetricDataset, summarizeSaving } from './saving.js'

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildReportHTML(state, options = {}) {
  const { isDark = false, strictParity = true } = options
  const { title, subtitle, period, company, cols = [], rows = [], kpis = [], colors, sections, saving: savCfg, groupCol, footer, insights = [] } = state
  const p1 = colors?.primary || '#1a3a5c'
  const p2 = colors?.secondary || '#2e5c8a'
  const acc = colors?.accent || '#4ade80'
  const bg = isDark ? '#080f18' : (colors?.bg || '#eef1f5')
  const txt = isDark ? '#d9e2ec' : (colors?.text || '#1e293b')
  const cardBg = isDark ? '#0d1a26' : '#ffffff'
  const bdColor = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'
  const subTxt = isDark ? '#486581' : '#94a3b8'
  const showFilters = sections?.filters !== false
  const rowRenderLimit = rows.length
  const chartPayload = buildChartPayload(state)
  const chartPayloadJSON = JSON.stringify(chartPayload)

  function pnum(v) {
    let s = String(v ?? '').trim().replace(/[R$€£¥\s]/g, '')
    if (!s) return 0
    const dots = (s.match(/\./g) || []).length
    const commas = (s.match(/,/g) || []).length
    if (dots === 0 && commas === 0) return parseFloat(s) || 0
    if (commas === 1 && /,\d{1,2}$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
    if (dots === 1 && /\.\d{1,2}$/.test(s)) return parseFloat(s.replace(/,/g, '')) || 0
    if (dots > 1 && commas === 0) return parseFloat(s.replace(/\./g, '')) || 0
    return parseFloat(s.replace(',', '.')) || 0
  }
  const fmtBRL = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtPct = v => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

  function renderInsightsHTML(items = []) {
    if (!items.length) {
      return `<div style="margin:16px 0;padding:14px 18px;background:${cardBg};
                  border:1px solid ${bdColor};border-radius:9px;
                  font-size:13px;color:${subTxt};">
          Não foram identificados pontos críticos nos dados analisados.
      </div>`
    }

    const severityColors = {
      alta: { border: '#ef4444', badgeBg: 'rgba(239,68,68,0.15)', badgeTxt: '#f87171' },
      media: { border: '#f59e0b', badgeBg: 'rgba(245,158,11,0.15)', badgeTxt: '#fbbf24' },
      baixa: { border: '#3b82f6', badgeBg: 'rgba(59,130,246,0.15)', badgeTxt: '#60a5fa' },
    }
    const typeIcons = { financeiro: '💰', risco: '⚠️', operacional: '⚙️' }

    const itemsHTML = items.map((ins, index) => {
      const sev = ins?.severidade || 'baixa'
      const tipo = ins?.tipo || 'operacional'
      const palette = severityColors[sev] || severityColors.baixa
      return `
        <div style="display:flex;gap:12px;align-items:flex-start;
                    padding:10px 14px;border-left:3px solid ${palette.border};
                    background:${isDark ? '#102132' : '#f8fafc'};
                    border-radius:0 6px 6px 0;margin-bottom:${index === items.length - 1 ? 0 : 8}px;">
            <span style="font-size:16px;flex-shrink:0;margin-top:1px">${typeIcons[tipo] || '📊'}</span>
            <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap;">
                    <span style="font-size:13px;font-weight:700;color:${txt}">
                        ${escapeHtml(ins?.titulo || '')}
                    </span>
                    <span style="font-size:10px;font-weight:600;padding:1px 7px;
                                 border-radius:999px;background:${palette.badgeBg};
                                 color:${palette.badgeTxt};">
                        ${escapeHtml(String(sev).toUpperCase())}
                    </span>
                </div>
                <div style="font-size:12px;color:${isDark ? '#7f9ab5' : '#64748b'};line-height:1.5">
                    ${escapeHtml(ins?.descricao || '')}
                </div>
            </div>
        </div>`
    }).join('')

    return `
    <div style="margin:16px 0;background:${cardBg};border:1px solid ${bdColor};
                border-radius:9px;overflow:hidden;">
        <div style="padding:10px 16px;border-bottom:1px solid ${bdColor};
                    font-size:12px;font-weight:700;color:${isDark ? '#2e5c8a' : '#1d4ed8'};
                    text-transform:uppercase;letter-spacing:.05em;">
            🚨 Insights Automáticos
        </div>
        <div style="padding:12px 16px;">
            ${itemsHTML}
        </div>
    </div>`
  }

  const ciRaw = (v) => {
    const n = parseInt(v)
    return isNaN(n) || n < 0 || n >= cols.length ? -1 : n
  }

  const sumCol = (idx) => idx < 0 ? 0 : rows.reduce((s, r) => s + pnum(r.cells?.[idx]), 0)
  const metricDataset = buildMetricDataset(rows, savCfg, cols.length)
  const savingSummary = summarizeSaving(rows, savCfg, cols.length)
  const resolvedSavCfg = metricDataset.config
  const savingDetailItems = metricDataset.detailItems || []
  const v1CI = ciRaw(resolvedSavCfg.v1Col)
  const v2CI = ciRaw(resolvedSavCfg.v2Col)
  const savTotal = savingSummary.total

  const kpiHTML = sections?.kpi && kpis.length ? `<div class="kpi-row">${kpis.map(k => {
    const colI = (k.col === '' || k.col == null) ? -1 : parseInt(k.col)
    let val = '—'
    if (colI < 0) val = rows.length.toLocaleString('pt-BR')
    else {
      const vals = rows.map(r => r.cells?.[colI]).filter(Boolean)
      const nums = vals.map(v => pnum(v))
      const isNum = cols[colI]?.type === 'number'
      if (k.fmt === 'sum') { const s = nums.reduce((a, b) => a + b, 0); val = isNum ? fmtBRL(s) : s.toLocaleString('pt-BR') }
      else if (k.fmt === 'avg' && nums.length) { const a = nums.reduce((x, y) => x + y, 0) / nums.length; val = isNum ? fmtBRL(a) : a.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) }
      else if (k.fmt === 'max' && nums.length) val = isNum ? fmtBRL(Math.max(...nums)) : Math.max(...nums).toLocaleString('pt-BR')
      else if (k.fmt === 'min' && nums.length) val = isNum ? fmtBRL(Math.min(...nums)) : Math.min(...nums).toLocaleString('pt-BR')
      else if (k.fmt === 'count') val = vals.filter(Boolean).length.toLocaleString('pt-BR')
      else if (k.fmt === 'countuniq') val = new Set(vals.filter(Boolean)).size.toLocaleString('pt-BR')
      else if (k.fmt === 'topval') {
        const freq = {}
        vals.forEach(v => { freq[v] = (freq[v] || 0) + 1 })
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]
        val = top ? `${String(top[0]).substring(0, 20)} (${top[1]})` : '—'
      }
    }
    return `<div class="kpi" style="border-top-color:${k.color || p2}"><div class="kpi-ico">${escapeHtml(k.icon || '📊')}</div><div class="kpi-v" style="color:${k.color || p2}">${escapeHtml(val)}</div><div class="kpi-l">${escapeHtml(k.label || 'KPI')}</div></div>`
  }).join('')}</div>` : ''

  const savDetailsHTML = savingDetailItems.map((item, index) => {
    const valueText = item.kind === 'percent' ? fmtPct(item.value) : item.kind === 'number' ? fmtN(item.value) : fmtBRL(item.value)
    const valueStyle = item.accent ? ` style="color:${acc}"` : ''
    const arrow = index > 0 ? '<div>→</div>' : ''
    return `${arrow}<div><div class="sav-dv"${valueStyle}>${escapeHtml(valueText)}</div><div class="sav-dl">${escapeHtml(item.label)}</div></div>`
  }).join('')
  const savDisplay = resolvedSavCfg?.metricType === 'TAXA' ? fmtPct(savTotal) : resolvedSavCfg?.metricType === 'VOLUME' ? fmtN(savTotal) : fmtBRL(savTotal)
  const savHTML = sections?.saving ? `<div class="sav"><div><div class="sav-lbl">${escapeHtml(resolvedSavCfg?.label || 'Métrica principal')}</div><div class="sav-val">${escapeHtml(savDisplay)}</div>${savDetailsHTML ? `<div class="sav-det">${savDetailsHTML}</div>` : ''}</div><div style="font-size:48px;opacity:.12">💹</div></div>` : ''
  const insightsHTML = renderInsightsHTML(insights?.length ? insights : (metricDataset.insights || []))

  const grpCI = ciRaw(groupCol)
  const summaryData = grpCI < 0 ? [] : (() => {
    const agg = {}
    rows.forEach(r => {
      const key = String(r.cells?.[grpCI] ?? '').trim() || '(vazio)'
      if (!agg[key]) agg[key] = { n: 0, v1: 0, v2: 0 }
      agg[key].n += 1
      if (v1CI >= 0) agg[key].v1 += pnum(r.cells?.[v1CI])
      if (v2CI >= 0) agg[key].v2 += pnum(r.cells?.[v2CI])
    })
    return Object.entries(agg).sort((a, b) => b[1].n - a[1].n)
  })()

  const summaryHTML = sections?.summary && summaryData.length ? `
<div class="summary">
  <div class="summary-title">🗂 Resumo por ${escapeHtml(cols[grpCI]?.name || '—')}</div>
  <div style="overflow-x:auto">
    <table class="summary-table">
      <thead><tr>
        <th>${escapeHtml(cols[grpCI]?.name || 'Grupo')}</th>
        <th class="tr">Qtd</th>
        ${v1CI >= 0 ? `<th class="tr">${escapeHtml(cols[v1CI]?.name || 'Valor 1')}</th>` : ''}
        ${v2CI >= 0 ? `<th class="tr">${escapeHtml(cols[v2CI]?.name || 'Valor 2')}</th>` : ''}
      </tr></thead>
      <tbody>
        ${summaryData.map(([key, v], i) => `
        <tr style="background:${i % 2 === 0 ? (isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc') : 'transparent'}">
          <td>${escapeHtml(key)}</td>
          <td class="tr mono">${v.n.toLocaleString('pt-BR')}</td>
          ${v1CI >= 0 ? `<td class="tr mono">${escapeHtml(fmtBRL(v.v1))}</td>` : ''}
          ${v2CI >= 0 ? `<td class="tr mono">${escapeHtml(fmtBRL(v.v2))}</td>` : ''}
        </tr>`).join('')}
        <tr class="summary-total">
          <td>TOTAL GERAL</td>
          <td class="tr mono">${rows.length.toLocaleString('pt-BR')}</td>
          ${v1CI >= 0 ? `<td class="tr mono">${escapeHtml(fmtBRL(sumCol(v1CI)))}</td>` : ''}
          ${v2CI >= 0 ? `<td class="tr mono">${escapeHtml(fmtBRL(sumCol(v2CI)))}</td>` : ''}
        </tr>
      </tbody>
    </table>
  </div>
</div>` : ''

  const visCols = cols.map((c, i) => ({ ...c, i })).filter(c => c.vis !== false)
  const catCols = visCols.filter(vc => {
    const vals = new Set(rows.map(r => String(r.cells?.[vc.i] ?? '').trim()).filter(Boolean))
    return vals.size >= 2 && vals.size <= 40
  }).map(vc => ({
    i: vc.i,
    name: vc.name,
    vals: [...new Set(rows.map(r => String(r.cells?.[vc.i] ?? '').trim()).filter(Boolean))].sort(),
  }))

  const rowsJSON = JSON.stringify(rows.map(r => visCols.map(vc => r.cells?.[vc.i] ?? '')))
  const catJSON = JSON.stringify(catCols.map(c => ({ i: visCols.findIndex(vc => vc.i === c.i), name: c.name, vals: c.vals })))
  const filterInputStyle = `background:${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'};border:1px solid ${bdColor};border-radius:999px;color:${txt};font-size:12px;padding:7px 12px;outline:none;width:100%;font-family:inherit;`

  const tblHTML = sections?.table && visCols.length ? `
<div class="tbl-section">
  <div class="tbl-header">
    <span class="st" id="tbl-title">Todos os Registros — ${rows.length.toLocaleString('pt-BR')}</span>
    <span id="tbl-active" class="tbl-active" style="display:none"></span>
    <button id="tbl-clear" onclick="clearFilters()" style="display:none;font-size:11px;color:#f87171;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:5px;padding:3px 10px;cursor:pointer;">✕ Limpar filtros</button>
  </div>
  ${showFilters ? `
  <div class="tbl-filters">
    <input id="tbl-search" oninput="applyFilters()" placeholder="🔍 Buscar em todos os campos... (/)" style="${filterInputStyle}margin-bottom:10px" />
    <div class="tbl-compact-row">
      <select id="tbl-field" onchange="onFieldChange()" style="${filterInputStyle}appearance:none;cursor:pointer;">
        <option value="">Filtrar por campo...</option>
        ${catCols.map((cc, idx) => `<option value="${idx}">${escapeHtml(cc.name)}</option>`).join('')}
      </select>
      <select id="tbl-value" onchange="applyFilters()" style="${filterInputStyle}appearance:none;cursor:pointer;" disabled>
        <option value="">Selecione um campo primeiro</option>
      </select>
    </div>
  </div>` : ''}
  <div style="overflow-x:auto">
    <table id="mt">
      <thead><tr>${visCols.map(c => `<th>${escapeHtml(c.name)}</th>`).join('')}</tr></thead>
      <tbody id="tbl-body"></tbody>
    </table>
  </div>
  <div id="tbl-empty" style="display:none;text-align:center;padding:32px;color:${subTxt}">Nenhum registro encontrado</div>
</div>
<script>
const _rows = ${rowsJSON};
const _cats = ${catJSON};
const _isDark = ${isDark ? 'true' : 'false'};
const _enableFilters = ${showFilters ? 'true' : 'false'};
const _rowRenderLimit = ${rowRenderLimit};
const _totalRows = ${rows.length};
function esc(v){
  return String(v ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function applyFilters(){
  const q = _enableFilters ? (document.getElementById('tbl-search')?.value || '').toLowerCase().trim() : '';
  const fieldIdxRaw = _enableFilters ? (document.getElementById('tbl-field')?.value || '') : '';
  const fieldIdx = fieldIdxRaw === '' ? -1 : parseInt(fieldIdxRaw);
  const selectedVal = _enableFilters ? (document.getElementById('tbl-value')?.value || '') : '';
  const filtered = _rows.filter(r => {
    if (_enableFilters && q && !r.some(v => String(v).toLowerCase().includes(q))) return false;
    if (fieldIdx >= 0 && selectedVal && String(r[_cats[fieldIdx].i]) !== selectedVal) return false;
    return true;
  });
  const tbody = document.getElementById('tbl-body');
  tbody.innerHTML = filtered.slice(0, _rowRenderLimit).map((r, ri) =>
    '<tr style="background:' + (ri % 2 === 0 ? (_isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc') : 'transparent') + '">' +
    r.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>'
  ).join('');
  document.getElementById('tbl-empty').style.display = filtered.length === 0 ? 'block' : 'none';
  document.getElementById('tbl-title').textContent = (_enableFilters && (q || (fieldIdx >= 0 && selectedVal)))
    ? 'Todos os Registros — ' + filtered.length + ' de ' + _totalRows.toLocaleString('pt-BR')
    : 'Todos os Registros — ' + _totalRows.toLocaleString('pt-BR');
  const activeCount = (q ? 1 : 0) + ((fieldIdx >= 0 && selectedVal) ? 1 : 0);
  const activeBadge = document.getElementById('tbl-active');
  if (activeBadge) {
    activeBadge.style.display = activeCount ? 'inline-block' : 'none';
    activeBadge.textContent = activeCount + ' filtro' + (activeCount > 1 ? 's' : '');
  }
  const clearBtn = document.getElementById('tbl-clear');
  if (clearBtn) clearBtn.style.display = (_enableFilters && (q || (fieldIdx >= 0 && selectedVal))) ? 'inline-block' : 'none';
}
function onFieldChange(){
  if (!_enableFilters) return;
  const field = document.getElementById('tbl-field');
  const val = document.getElementById('tbl-value');
  const idx = field && field.value !== '' ? parseInt(field.value) : -1;
  if (!val) return;
  if (idx < 0 || !_cats[idx]) {
    val.innerHTML = '<option value="">Selecione um campo primeiro</option>';
    val.disabled = true;
    applyFilters();
    return;
  }
  val.innerHTML = '<option value="">Selecionar valor...</option>' + _cats[idx].vals.map(v => '<option value=\"' + esc(v) + '\">' + esc(v) + '</option>').join('');
  val.disabled = false;
  applyFilters();
}
function clearFilters(){
  if (!_enableFilters) return;
  const search = document.getElementById('tbl-search');
  const field = document.getElementById('tbl-field');
  const val = document.getElementById('tbl-value');
  if (search) search.value = '';
  if (field) field.value = '';
  if (val) {
    val.innerHTML = '<option value=\"\">Selecione um campo primeiro</option>';
    val.disabled = true;
  }
  applyFilters();
}
onFieldChange();
applyFilters();
window.addEventListener('keydown', (e) => {
  if (!_enableFilters || e.key !== '/') return;
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable) return;
  e.preventDefault();
  const s = document.getElementById('tbl-search');
  if (s) s.focus();
});
<\/script>` : ''

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title || 'Relatório')}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{background:${bg};font-family:'DM Sans',sans-serif;color:${txt};padding:20px;}
.wrap{max-width:1400px;margin:0 auto;}
.hd{position:relative;padding:1rem 0 1.25rem;margin-bottom:1.5rem;}
.hd-accent{position:absolute;top:0;left:0;width:48px;height:3px;border-radius:2px;background:linear-gradient(90deg,${p1},#0ea5e9);}
.hd-divider{position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,${p1}66,transparent);}
.hd-inner{padding-top:1rem;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:.5rem;}
.hd-title{font-size:1.6rem;font-weight:700;letter-spacing:-.03em;line-height:1.15;}
.hd-sub{font-size:.8rem;color:${subTxt};margin-top:.2rem;}
.hd-badges{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;}
.badge{font-size:.7rem;font-weight:500;color:${subTxt};background:${cardBg};border:1px solid ${bdColor};border-radius:6px;padding:.2rem .6rem;}
.badge-blue{color:${p2};background:${p1}22;border-color:${p1}55;font-weight:600;}
.sav{background:linear-gradient(135deg,${p1},${p2});color:#fff;border-radius:12px;padding:22px 28px;margin:18px 0;display:flex;align-items:center;justify-content:space-between;}
.sav-lbl{font-size:11px;opacity:.7;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;}
.sav-val{font-size:40px;font-weight:800;color:${acc};font-family:'DM Mono',monospace;}
.sav-det{display:flex;gap:24px;margin-top:12px;flex-wrap:wrap;align-items:center;}
.sav-dv{font-size:14px;font-weight:700;font-family:'DM Mono',monospace;}
.sav-dl{font-size:10px;opacity:.6;margin-top:2px;}
.kpi-row{display:flex;gap:12px;margin:18px 0;flex-wrap:wrap;}
.kpi{flex:1;min-width:110px;background:${cardBg};border:1px solid ${bdColor};border-radius:9px;padding:14px;text-align:center;border-top:4px solid ${p2};}
.kpi-ico{font-size:18px;margin-bottom:4px;}
.kpi-v{font-size:18px;font-weight:800;font-family:'DM Mono',monospace;}
.kpi-l{font-size:10px;color:${subTxt};margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;}
.cg{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0;}
.cc{background:${cardBg};border:1px solid ${bdColor};border-radius:9px;padding:16px;}
.cc.full{grid-column:1/-1;}
.ct{font-size:13px;font-weight:700;color:${p2};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${bdColor};}
.cw{position:relative;}
.summary{margin-top:22px;background:${cardBg};border:1px solid ${bdColor};border-radius:12px;padding:14px;}
.summary-title{font-size:12px;font-weight:700;color:${p2};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${bdColor};text-transform:uppercase;letter-spacing:.05em;}
.summary-table{width:100%;border-collapse:collapse;font-size:12px;}
.summary-table th{background:${p1};color:#fff;padding:8px 10px;font-size:11px;text-align:left;}
.summary-table th.tr,.summary-table td.tr{text-align:right;}
.summary-table td{padding:7px 10px;border-bottom:1px solid ${bdColor};color:${txt};}
.summary-table .mono{font-family:'DM Mono',monospace;}
.summary-total{background:${isDark ? 'rgba(255,255,255,0.05)' : '#e2e8f0'};font-weight:700;border-top:2px solid ${bdColor};}
.tbl-section{margin-top:22px;background:${cardBg};border:1px solid ${bdColor};border-radius:12px;overflow:hidden;}
.tbl-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid ${bdColor};}
.st{font-size:13px;font-weight:700;color:${p2};}
.tbl-active{font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(37,99,235,0.2);color:#60a5fa;margin-left:auto;margin-right:8px;}
.tbl-filters{padding:12px 16px;border-bottom:1px solid ${bdColor};background:${isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)'};}
.tbl-compact-row{display:grid;grid-template-columns:minmax(180px,240px) minmax(220px,1fr);gap:10px;}
table#mt{width:100%;border-collapse:collapse;font-size:12px;}
table#mt th{background:${p1};color:#fff;padding:9px 11px;font-size:11px;font-weight:700;text-transform:uppercase;white-space:nowrap;}
table#mt td{padding:7px 11px;border-bottom:1px solid ${bdColor};color:${txt};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;}
.footer{margin-top:24px;padding:10px 16px;background:${p1};color:rgba(255,255,255,.6);border-radius:8px;font-size:11px;text-align:center;}
@media(max-width:768px){.cg{grid-template-columns:1fr;}.cc.full{grid-column:1;}.tbl-compact-row{grid-template-columns:1fr;}}
</style></head>
<body data-export-mode="${strictParity ? 'strict' : 'compat'}"><div class="wrap">
<div class="hd">
  <div class="hd-accent"></div>
  <div class="hd-inner">
    <div>
      <div class="hd-title">${escapeHtml(title || 'Relatório')}</div>
      ${subtitle ? `<div class="hd-sub">${escapeHtml(subtitle)}</div>` : ''}
    </div>
    <div class="hd-badges">
      ${period ? `<span class="badge">${escapeHtml(period)}</span>` : ''}
      ${company ? `<span class="badge">${escapeHtml(company)}</span>` : ''}
      <span class="badge badge-blue">${rows.length.toLocaleString('pt-BR')} registros</span>
    </div>
  </div>
  <div class="hd-divider"></div>
</div>
${insightsHTML}
${savHTML}${kpiHTML}
<div class="cg" id="charts"></div>
${summaryHTML}
${tblHTML}
${sections?.footer ? `<div class="footer">${escapeHtml(footer || '')} · ${new Date().toLocaleDateString('pt-BR')}</div>` : ''}
</div>
<script>(function(){
const _isDark = ${isDark ? 'true' : 'false'};
const _charts = ${chartPayloadJSON};
const _pal = _isDark ? ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'] : ['#1d4ed8','#059669','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#4f46e5'];
const cg = document.getElementById('charts');
if (!_charts.length || !cg || !window.echarts) return;
function mk(id, full, title, h){
  const card = document.createElement('div');
  card.className = 'cc' + (full ? ' full' : '');
  const ct = document.createElement('div');
  ct.className = 'ct';
  ct.textContent = title || 'Gráfico';
  const cw = document.createElement('div');
  cw.className = 'cw';
  cw.style.height = (h || 260) + 'px';
  const target = document.createElement('div');
  target.id = id;
  target.style.width = '100%';
  target.style.height = '100%';
  cw.appendChild(target);
  card.appendChild(ct);
  card.appendChild(cw);
  cg.appendChild(card);
  return target;
}
function fmtBRL(v){
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
function baseGrid(horizontal){
  return horizontal ? { left:'22%', right:'4%', top:'8%', bottom:'12%', containLabel:false } : { left:'3%', right:'4%', top:'8%', bottom:'12%', containLabel:true };
}
function render(item){
  const el = mk(item.id, !!item.full, item.title, item.h || 260);
  const inst = echarts.init(el);
  let option = null;
  if (item.type === 'pie') {
    option = {
      color:_pal,
      tooltip:{ trigger:'item' },
      legend:{ orient:'vertical', right:0, top:'middle', textStyle:{ color:_isDark?'#94a3b8':'#64748b', fontSize:11 } },
      series:[{
        type:'pie',
        radius:item.rose ? ['15%','72%'] : item.donut ? ['45%','72%'] : ['0%','72%'],
        roseType:item.rose ? 'radius' : false,
        center:['42%','50%'],
        itemStyle:{ borderColor:_isDark?'#0d1a26':'#fff', borderWidth:2 },
        data:item.labels.map((n,i)=>({ name:n, value:item.data[i] || 0 }))
      }]
    };
  }
  if (item.type === 'bar') {
    const horizontal = !!item.horizontal;
    option = {
      color:_pal,
      grid:baseGrid(horizontal),
      tooltip:{ trigger:'axis' },
      xAxis:horizontal
        ? { type:'value', axisLabel:{ color:_isDark?'#94a3b8':'#64748b', formatter:item.isNum ? (v)=>fmtBRL(v).replace('R$\\u00a0','') : undefined }, splitLine:{ lineStyle:{ color:_isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)' } }, axisLine:{ lineStyle:{ color:_isDark?'#1c3350':'#e2e8f0' } } }
        : { type:'category', data:item.labels, axisLabel:{ color:_isDark?'#94a3b8':'#64748b', interval:0, rotate:item.labels.length>8?30:0 }, axisLine:{ lineStyle:{ color:_isDark?'#1c3350':'#e2e8f0' } } },
      yAxis:horizontal
        ? { type:'category', data:item.labels, axisLabel:{ color:_isDark?'#94a3b8':'#64748b' }, axisLine:{ lineStyle:{ color:_isDark?'#1c3350':'#e2e8f0' } } }
        : { type:'value', axisLabel:{ color:_isDark?'#94a3b8':'#64748b', formatter:item.isNum ? (v)=>fmtBRL(v).replace('R$\\u00a0','') : undefined }, splitLine:{ lineStyle:{ color:_isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)' } }, axisLine:{ lineStyle:{ color:_isDark?'#1c3350':'#e2e8f0' } } },
      series:[{ type:'bar', data:item.data, itemStyle:{ borderRadius:horizontal?[0,6,6,0]:[6,6,0,0] } }]
    };
  }
  if (item.type === 'line') {
    option = {
      color:_pal,
      tooltip:{ trigger:'axis' },
      legend:{ top:0, textStyle:{ color:_isDark?'#94a3b8':'#64748b', fontSize:11 } },
      grid:{ left:'3%', right:'4%', top:'16%', bottom:'12%', containLabel:true },
      xAxis:{ type:'category', data:item.labels, boundaryGap:item.bar === true, axisLabel:{ color:_isDark?'#94a3b8':'#64748b' }, axisLine:{ lineStyle:{ color:_isDark?'#1c3350':'#e2e8f0' } } },
      yAxis:{ type:'value', axisLabel:{ color:_isDark?'#94a3b8':'#64748b', formatter:item.isNum ? (v)=>fmtBRL(v).replace('R$\\u00a0','') : undefined }, splitLine:{ lineStyle:{ color:_isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)' } }, axisLine:{ lineStyle:{ color:_isDark?'#1c3350':'#e2e8f0' } } },
      series:[
        item.bar ? { type:'bar', name:item.name1 || 'V1', data:item.d1 } : { type:'line', smooth:true, name:item.name1 || 'V1', data:item.d1, areaStyle:item.area ? {} : undefined },
        ...(item.d2 && item.d2.some(v=>v!==0) ? [item.bar ? { type:'bar', name:item.name2 || 'V2', data:item.d2 } : { type:'line', smooth:true, name:item.name2 || 'V2', data:item.d2, areaStyle:item.area ? {} : undefined }] : [])
      ]
    };
  }
  if (item.type === 'radar') {
    option = {
      color:_pal,
      tooltip:{},
      radar:{
        indicator:item.labels.slice(0,8).map((n,i)=>({ name:n, max:(item.data[i] || 0) * 1.3 || 1 })),
        axisName:{ color:_isDark?'#94a3b8':'#64748b', fontSize:10 },
      },
      series:[{ type:'radar', data:[{ value:item.data.slice(0,8), name:'Valor', areaStyle:{ opacity:0.25 } }] }]
    };
  }
  if (item.type === 'treemap') {
    option = {
      color:_pal,
      tooltip:{},
      series:[{ type:'treemap', breadcrumb:{ show:false }, roam:false, data:item.labels.map((n,i)=>({ name:n, value:item.data[i] || 0 })) }]
    };
  }
  if (item.type === 'funnel') {
    option = {
      color:_pal,
      tooltip:{},
      series:[{ type:'funnel', left:'10%', width:'80%', top:'5%', bottom:'5%', sort:'descending', data:item.labels.map((n,i)=>({ name:n, value:item.data[i] || 0 })) }]
    };
  }
  if (item.type === 'scatter') {
    option = {
      color:_pal,
      tooltip:{ trigger:'item' },
      grid:{ left:'8%', right:'4%', top:'8%', bottom:'12%', containLabel:true },
      xAxis:{ type:'value', name:item.xName || 'X', axisLabel:{ color:_isDark?'#94a3b8':'#64748b' }, splitLine:{ lineStyle:{ color:_isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)' } } },
      yAxis:{ type:'value', name:item.yName || 'Y', axisLabel:{ color:_isDark?'#94a3b8':'#64748b', formatter:(v)=>fmtBRL(v).replace('R$\\u00a0','') }, splitLine:{ lineStyle:{ color:_isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)' } } },
      series:[{ type:'scatter', symbolSize:9, data:item.points || [] }]
    };
  }
  if (item.type === 'heatmap') {
    const maxV = Math.max(1, ...(item.data || []).map(d=>d[2] || 0));
    option = {
      tooltip:{},
      grid:{ left:'12%', right:'12%', top:'10%', bottom:'15%' },
      xAxis:{ type:'category', data:item.xLabels || [], splitArea:{ show:true }, axisLabel:{ color:_isDark?'#94a3b8':'#64748b' } },
      yAxis:{ type:'category', data:item.yLabels || [], splitArea:{ show:true }, axisLabel:{ color:_isDark?'#94a3b8':'#64748b' } },
      visualMap:{ min:0, max:maxV, calculable:true, orient:'horizontal', left:'center', bottom:0, textStyle:{ color:_isDark?'#94a3b8':'#64748b' }, inRange:{ color:_isDark?['#1c3350','#3b82f6','#10b981']:['#e0f2fe','#3b82f6','#059669'] } },
      series:[{ type:'heatmap', data:item.data || [] }]
    };
  }
  if (item.type === 'waterfall') {
    const vals = item.data || [];
    const helper = [];
    const bars = [];
    let base = 0;
    vals.forEach(v => {
      helper.push(v >= 0 ? base : base + v);
      bars.push(Math.abs(v));
      base += v;
    });
    option = {
      color:_pal,
      tooltip:{ trigger:'axis' },
      grid:{ left:'3%', right:'4%', top:'8%', bottom:'12%', containLabel:true },
      xAxis:{ type:'category', data:item.labels || [], axisLabel:{ color:_isDark?'#94a3b8':'#64748b' } },
      yAxis:{ type:'value', axisLabel:{ color:_isDark?'#94a3b8':'#64748b', formatter:(v)=>fmtBRL(v).replace('R$\\u00a0','') }, splitLine:{ lineStyle:{ color:_isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)' } } },
      series:[
        { type:'bar', stack:'total', data:helper, itemStyle:{ color:'transparent' }, silent:true },
        { type:'bar', stack:'total', data:bars }
      ]
    };
  }
  if (!option) return;
  inst.setOption(option, true);
}
_charts.forEach(render);
window.addEventListener('resize', () => {
  document.querySelectorAll('.cw > div').forEach((el) => {
    const instance = echarts.getInstanceByDom(el);
    if (instance) instance.resize();
  });
});
})();<\/script></body></html>`
}

export function buildChartPayload(state) {
  const { cols = [], rows = [], saving: savCfg = {}, sections = {} } = state
  if (!cols.length || !rows.length || sections?.charts === false) return []
  return (buildMetricDataset(rows, savCfg, cols.length).chartConfig || []).map((chart, index) => ({
    id: chart.id || `metric-${index + 1}`,
    full: index >= 2,
    title: chart.title,
    h: index >= 2 ? 300 : 260,
    type: chart.type === 'hbar' ? 'bar' : chart.type,
    horizontal: chart.type === 'hbar',
    labels: chart.labels,
    data: chart.data,
    d1: chart.d1,
    d2: chart.d2,
    isNum: chart.isCurrency || chart.isPercent,
  }))
}

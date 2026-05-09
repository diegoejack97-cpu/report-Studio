import { selectMetricCharts } from './chartSelection.js'
import { premiumizeEChartOption } from './chartTheme.js'

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
  const { title, subtitle, period, company, cols = [], colors, sections, footer } = state
  const reportData = state.reportData || {}
  const safeReportData = reportData || {}
  const dataset = safeReportData.dataset
  const rows = Array.isArray(dataset)
    ? dataset
    : Array.isArray(dataset?.rows)
      ? dataset.rows
      : []
  const summary = safeReportData.summary || dataset?.summary || { labels: [], rows: [], totals: {} }
  const kpis = safeReportData.kpis || dataset?.kpis || []
  const detailItems = safeReportData.detail_items || dataset?.detail_items || []
  const metric = safeReportData.metric || summary?.primary_metric || { type: 'ECONOMIA', value: 0, label: 'Saving Total' }
  const insights = safeReportData.insights || []
  const p1 = colors?.primary || '#1a3a5c'
  const p2 = colors?.secondary || '#2e5c8a'
  const acc = colors?.accent || '#4ade80'
  const bg = isDark ? '#080f18' : (colors?.bg || '#eef1f5')
  const txt = isDark ? '#d9e2ec' : (colors?.text || '#1e293b')
  const cardBg = isDark ? '#0d1a26' : '#ffffff'
  const bdColor = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'
  const subTxt = isDark ? '#486581' : '#94a3b8'
  const expElev1 = isDark
    ? '0 10px 26px rgba(1,8,16,0.42), inset 0 1px 0 rgba(255,255,255,0.04)'
    : '0 8px 24px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.92)'
  const expElev2 = isDark
    ? '0 14px 34px rgba(1,8,16,0.5), inset 0 1px 0 rgba(255,255,255,0.06)'
    : '0 12px 30px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,0.96)'
  const expPanelGrad = isDark
    ? 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.8))'
  const expPanelSubtle = isDark
    ? 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.7))'
  const showFilters = sections?.filters !== false
  const showCharts = sections?.charts !== false
  const rowRenderLimit = Number.isFinite(Number(options.tableRenderLimit))
    ? Math.max(1, Number(options.tableRenderLimit))
    : 500
  const rawCharts = Array.isArray(safeReportData.charts) ? safeReportData.charts : []
  const chartTypeOf = chart => {
    const firstSeries = Array.isArray(chart?.option?.series) ? chart.option.series[0] : chart?.option?.series
    if (chart?.type) return String(chart.type).toLowerCase()
    if (firstSeries?.type) return String(firstSeries.type).toLowerCase()
    if (chart?.source === 'top_items') return 'hbar'
    if (chart?.source === 'by_date') return 'line'
    return 'bar'
  }
  const selectedCharts = selectMetricCharts(rawCharts, metric.type || 'ECONOMIA', rows.length)
  const charts = selectedCharts.map((chart, index) => {
    const type = chartTypeOf(chart)
    const sameTypeIndex = selectedCharts.slice(0, index).filter(item => chartTypeOf(item) === type).length
    return {
      ...chart,
      option: chart?.option ? premiumizeEChartOption(chart.option, { isDark, chart, chartIndex: index, sameTypeIndex }) : chart?.option,
    }
  })
  const chartsJSON = JSON.stringify(charts)
  const reportDataJSON = JSON.stringify(reportData)
  const fmtBRL = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
  const fmtN = v => Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  const fmtPct = v => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  const recordCount = summary?.totals?.count ?? rows.length
  const metricColor = {
    ECONOMIA: '#16A34A',
    TOTAL: '#2563EB',
    VARIACAO: '#F59E0B',
    TAXA: '#7C3AED',
    VOLUME: '#6B7280',
  }[metric.type || 'ECONOMIA'] || '#16A34A'
  const formatMetricValue = (metricType, value, unit) => {
    if (unit === 'percent' || metricType === 'TAXA' || metricType === 'VARIACAO') return fmtPct(value)
    if (unit === 'number' || metricType === 'VOLUME') return fmtN(value)
    return fmtBRL(value)
  }

  function renderInsightsHTML(items = []) {
    if (!items.length) {
      return `<div class="insights-empty">
        <span class="insight-dot"></span>
        Não foram identificados pontos críticos nos dados analisados.
      </div>`
    }

    const severityColors = {
      alta: { border: '#ef4444', badgeBg: 'rgba(239,68,68,0.15)', badgeTxt: '#f87171' },
      media: { border: '#f59e0b', badgeBg: 'rgba(245,158,11,0.15)', badgeTxt: '#fbbf24' },
      baixa: { border: '#3b82f6', badgeBg: 'rgba(59,130,246,0.15)', badgeTxt: '#60a5fa' },
    }
    const typeIcons = { financeiro: 'FIN', risco: 'ALR', operacional: 'OPS' }

    const itemsHTML = items.map((ins, index) => {
      const sev = ins?.severidade || 'baixa'
      const tipo = ins?.tipo || 'operacional'
      const palette = severityColors[sev] || severityColors.baixa
      return `
        <div class="insight-card" style="--insight-color:${palette.border};margin-bottom:${index === items.length - 1 ? 0 : 8}px;">
            <span class="insight-icon">${typeIcons[tipo] || 'CHT'}</span>
            <div>
                <div class="insight-head">
                    <span class="insight-title">${escapeHtml(ins?.titulo || '')}</span>
                    <span class="insight-badge" style="background:${palette.badgeBg};color:${palette.badgeTxt};">
                        ${escapeHtml(String(sev).toUpperCase())}
                    </span>
                </div>
                <div class="insight-body">${escapeHtml(ins?.descricao || '')}</div>
            </div>
        </div>`
    }).join('')

    return `
    <div class="insights">
        <div class="insights-title">
            <span class="insight-dot"></span>
            Insights automáticos
        </div>
        <div class="insights-body">
            ${itemsHTML}
        </div>
    </div>`
  }

  const ciRaw = (v) => {
    const n = parseInt(v, 10)
    return isNaN(n) || n < 0 || n >= cols.length ? -1 : n
  }
  const metricType = metric.type || 'ECONOMIA'
  const savTotal = metric.value ?? summary?.primary_metric?.value ?? 0

  const kpiHTML = sections?.kpi && kpis.length ? `<div class="kpi-row">${kpis.map(k => {
    const kpiColor = k.color || p2
    return `<div class="kpi" style="--kpi-color:${kpiColor};border-top-color:${kpiColor}">
      <div class="kpi-badge">Indicador</div>
      <div class="kpi-ico">${escapeHtml(k.icon || 'KPI')}</div>
      <div class="kpi-v" style="color:${kpiColor}">${escapeHtml(k.display ?? k.value ?? '—')}</div>
      <div class="kpi-l">${escapeHtml(k.label || 'KPI')}</div>
    </div>`
  }).join('')}</div>` : ''

  const savDetailsHTML = detailItems.map((item, index) => {
    const valueText = item.kind === 'percent' ? fmtPct(item.value) : item.kind === 'number' ? fmtN(item.value) : fmtBRL(item.value)
    const valueStyle = item.accent ? ` style="color:${acc}"` : ''
    const arrow = index > 0 ? '<div>→</div>' : ''
    return `${arrow}<div><div class="sav-dv"${valueStyle}>${escapeHtml(valueText)}</div><div class="sav-dl">${escapeHtml(item.label)}</div></div>`
  }).join('')
  const savDisplay = metric.formatted_value || summary?.primary_metric?.formatted_value || formatMetricValue(metricType, savTotal, metric.unit)
  const metricDisplayType = summary?.primary_metric?.type || (metricType === 'TAXA' || metricType === 'VARIACAO' ? 'percentual' : metricType === 'VOLUME' ? 'quantidade' : 'monetário')
  const savHTML = sections?.saving ? `<div class="sav" style="--metric-color:${metricColor}">
    <div class="sav-main">
      <div class="sav-badges">
        <span>Métrica principal</span>
        <span>${escapeHtml(metricType)} · ${escapeHtml(metricDisplayType)}</span>
      </div>
      <div class="sav-lbl">${escapeHtml(metric.label || summary?.primary_metric?.label || 'Métrica principal')}</div>
      <div class="sav-val">${escapeHtml(savDisplay)}</div>
      ${savDetailsHTML ? `<div class="sav-det">${savDetailsHTML}</div>` : ''}
    </div>
    <div class="sav-mark">METRICA</div>
  </div>` : ''
  const insightsHTML = renderInsightsHTML(insights)
  const summaryValueLabel = metric.label || summary?.primary_metric?.label || 'Valor'
  const showSummaryValue = Array.isArray(summary.rows) && summary.rows.some(row => row?.value != null && Number.isFinite(Number(row.value)))

  const summaryHTML = sections?.summary && summary.rows.length ? `
<div class="summary">
  <div class="summary-title">Resumo por ${escapeHtml(cols[summary.group_index]?.name || '—')}</div>
  <div class="summary-scroll">
    <table class="summary-table">
      <thead><tr>
        <th>${escapeHtml(cols[summary.group_index]?.name || 'Grupo')}</th>
        <th class="tr">Qtd</th>
        ${showSummaryValue ? `<th class="tr">${escapeHtml(summaryValueLabel)}</th>` : ''}
      </tr></thead>
      <tbody>
        ${summary.rows.map((v, i) => `
        <tr style="background:${i % 2 === 0 ? (isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc') : 'transparent'}">
          <td>${escapeHtml(v.label)}</td>
          <td class="tr mono">${v.count.toLocaleString('pt-BR')}</td>
          ${showSummaryValue ? `<td class="tr mono">${escapeHtml(formatMetricValue(metric.type, v.value, metric.unit))}</td>` : ''}
        </tr>`).join('')}
        <tr class="summary-total">
          <td>TOTAL GERAL</td>
          <td class="tr mono">${(summary.totals.count ?? 0).toLocaleString('pt-BR')}</td>
          ${showSummaryValue ? `<td class="tr mono">${escapeHtml(formatMetricValue(metric.type, summary.totals.value ?? metric.value ?? 0, metric.unit))}</td>` : ''}
        </tr>
      </tbody>
    </table>
  </div>
</div>` : ''

  const visCols = cols.map((c, i) => ({ ...c, i })).filter(c => c.vis !== false)
  const catCols = visCols.filter(vc => {
    const vals = new Set(rows.map(r => String(r?.cells?.[vc.i] ?? r?.[vc.i] ?? '').trim()).filter(Boolean))
    return vals.size >= 2 && vals.size <= 40
  }).map(vc => ({
    i: vc.i,
    name: vc.name,
    vals: [...new Set(rows.map(r => String(r?.cells?.[vc.i] ?? r?.[vc.i] ?? '').trim()).filter(Boolean))].sort(),
  }))

  const rowsJSON = JSON.stringify(rows.map(r => visCols.map(vc => r?.cells?.[vc.i] ?? r?.[vc.i] ?? '')))
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
    <input id="tbl-search" oninput="applyFilters()" placeholder="Buscar em todos os campos... (/)" style="${filterInputStyle}margin-bottom:10px" />
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
  <div class="table-scroll">
    <table id="mt">
      <thead><tr>${visCols.map(c => `<th>${escapeHtml(c.name)}</th>`).join('')}</tr></thead>
      <tbody id="tbl-body"></tbody>
    </table>
  </div>
  <div id="tbl-limit" class="tbl-limit" style="display:none"></div>
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
  const visibleRows = filtered.slice(0, _rowRenderLimit);
  tbody.innerHTML = visibleRows.map((r, ri) =>
    '<tr style="background:' + (ri % 2 === 0 ? (_isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc') : 'transparent') + '">' +
    r.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>'
  ).join('');
  document.getElementById('tbl-empty').style.display = filtered.length === 0 ? 'block' : 'none';
  const limitNotice = document.getElementById('tbl-limit');
  if (limitNotice) {
    const isLimited = filtered.length > _rowRenderLimit;
    limitNotice.style.display = isLimited ? 'block' : 'none';
    limitNotice.textContent = isLimited
      ? 'Exibindo as primeiras ' + _rowRenderLimit.toLocaleString('pt-BR') + ' linhas de ' + filtered.length.toLocaleString('pt-BR') + ' registros.'
      : '';
  }
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
html{background:${bg};}
body{background:radial-gradient(circle at top,${isDark ? 'rgba(37,99,235,.12)' : 'rgba(37,99,235,.08)'},transparent 34rem),${bg};font-family:'DM Sans',sans-serif;color:${txt};padding:24px 20px;min-height:100vh;}
.wrap{max-width:1400px;margin:0 auto;}
.hd{position:relative;overflow:hidden;padding:1.15rem 1.2rem 1.2rem;margin-bottom:1.35rem;background:${cardBg};background-image:${expPanelGrad};border:1px solid ${bdColor};border-radius:16px;box-shadow:${expElev2};}
.hd::after{content:"";position:absolute;inset:auto -10% -45% 55%;height:140%;background:radial-gradient(circle,${p1}22,transparent 62%);pointer-events:none;}
.hd-accent{position:absolute;top:0;left:0;width:76px;height:3px;border-radius:2px;background:linear-gradient(90deg,${p1},#22d3ee);}
.hd-divider{position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,${p1}66,transparent);}
.hd-inner{position:relative;z-index:1;padding-top:.85rem;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:1rem;}
.hd-kicker{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${p2};margin-bottom:.45rem;}
.hd-title{font-size:clamp(1.65rem,3vw,2.2rem);font-weight:800;letter-spacing:-.03em;line-height:1.08;}
.hd-sub{font-size:.88rem;color:${subTxt};margin-top:.35rem;}
.hd-badges{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;}
.badge{font-size:.7rem;font-weight:600;color:${subTxt};background:${cardBg};border:1px solid ${bdColor};border-radius:999px;padding:.2rem .7rem;box-shadow:inset 0 1px 0 ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.95)'};}
.badge-blue{color:${p2};background:${p1}22;border-color:${p1}55;font-weight:600;}
.insights-empty{margin:16px 0;padding:16px 18px;background:${cardBg};background-image:${expPanelSubtle};border:1px solid ${bdColor};border-radius:13px;box-shadow:${expElev1};font-size:13px;color:${subTxt};display:flex;align-items:center;gap:10px;}
.insights{margin:18px 0;background:${cardBg};background-image:${expPanelSubtle};border:1px solid ${bdColor};border-radius:14px;overflow:hidden;box-shadow:${expElev1};}
.insights-title{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid ${bdColor};font-size:12px;font-weight:800;color:${p2};text-transform:uppercase;letter-spacing:.06em;background:${isDark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.65)'};}
.insight-dot{width:7px;height:7px;border-radius:999px;background:#60a5fa;box-shadow:0 0 14px rgba(96,165,250,.75);flex-shrink:0;}
.insights-body{padding:14px 16px;}
.insight-card{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-left:3px solid var(--insight-color);background:${isDark ? 'linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,0)),#102132' : 'linear-gradient(180deg,rgba(255,255,255,.96),rgba(255,255,255,.76)),#f8fafc'};border-radius:0 10px 10px 0;border-top:1px solid ${bdColor};border-right:1px solid ${bdColor};border-bottom:1px solid ${bdColor};box-shadow:${expElev1};}
.insight-icon{width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--insight-color) 14%,transparent);border:1px solid color-mix(in srgb,var(--insight-color) 32%,transparent);color:var(--insight-color);font-size:10px;font-weight:800;flex-shrink:0;}
.insight-head{display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;}
.insight-title{font-size:13px;font-weight:800;color:${txt};}
.insight-badge{font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;text-transform:uppercase;}
.insight-body{font-size:12px;color:${isDark ? '#7f9ab5' : '#64748b'};line-height:1.55;}
.sav{position:relative;overflow:hidden;background:radial-gradient(circle at 18% 12%,rgba(255,255,255,.24),transparent 30%),radial-gradient(circle at 92% 8%,color-mix(in srgb,var(--metric-color) 28%,transparent),transparent 34%),linear-gradient(135deg,${p1},${p2});color:#fff;border-radius:16px;padding:24px 30px;margin:20px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;border:1px solid rgba(255,255,255,.18);box-shadow:0 24px 58px color-mix(in srgb,var(--metric-color) 28%,transparent),${expElev2},inset 0 1px 0 rgba(255,255,255,.24);}
.sav-main{min-width:0;flex:1;}
.sav-badges{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.sav-badges span{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);border-radius:999px;padding:4px 10px;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.9);}
.sav-lbl{font-size:11px;opacity:.76;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em;}
.sav-val{font-size:52px;line-height:1.02;font-weight:800;color:#f8fafc;text-shadow:0 0 34px color-mix(in srgb,var(--metric-color) 45%,transparent);font-family:'DM Mono',monospace;overflow-wrap:anywhere;}
.sav-det{display:flex;gap:24px;margin-top:12px;flex-wrap:wrap;align-items:center;}
.sav-dv{font-size:14px;font-weight:800;font-family:'DM Mono',monospace;}
.sav-dl{font-size:10px;opacity:.68;margin-top:2px;text-transform:uppercase;letter-spacing:.04em;}
.sav-mark{font-size:20px;opacity:.18;font-weight:800;letter-spacing:.08em;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.09);border-radius:12px;padding:14px 16px;}
.kpi-row{display:flex;gap:12px;margin:18px 0;flex-wrap:wrap;}
.kpi{position:relative;overflow:hidden;flex:1;min-width:150px;background:${cardBg};background-image:radial-gradient(circle at 100% 0%,var(--kpi-color)18,transparent 42%),${expPanelSubtle};border:1px solid ${bdColor};border-radius:13px;padding:16px;text-align:left;border-top:4px solid ${p2};box-shadow:${expElev1};}
.kpi-badge{display:inline-flex;border:1px solid color-mix(in srgb,var(--kpi-color) 36%,transparent);background:color-mix(in srgb,var(--kpi-color) 12%,transparent);color:var(--kpi-color);border-radius:999px;padding:3px 8px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px;}
.kpi-ico{position:absolute;right:14px;top:14px;width:38px;height:38px;border-radius:12px;border:1px solid ${bdColor};background:${isDark ? 'rgba(255,255,255,.05)' : 'rgba(15,23,42,.04)'};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:var(--kpi-color);}
.kpi-v{font-size:26px;line-height:1.04;font-weight:800;font-family:'DM Mono',monospace;padding-right:44px;overflow-wrap:anywhere;}
.kpi-l{font-size:10px;color:${subTxt};margin-top:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;}
.cg{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:20px 0;}
.cc{background:${cardBg};background-image:${expPanelGrad};border:1px solid ${bdColor};border-radius:14px;padding:18px;box-shadow:${expElev2};}
.cc.full{grid-column:1/-1;}
.ch{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid ${bdColor};}
.ct{font-size:13px;font-weight:800;color:${txt};text-transform:uppercase;letter-spacing:.04em;}
.ct-reason{font-size:10px;font-weight:600;color:${subTxt};text-transform:none;letter-spacing:0;margin-top:3px;}
.ct-source{font-size:10px;font-weight:500;color:${subTxt};text-transform:none;letter-spacing:0;margin-top:3px;opacity:.92;}
.ct-badge{font-size:10px;font-weight:700;color:${p2};background:${p1}1f;border:1px solid ${p1}55;border-radius:999px;padding:3px 8px;white-space:nowrap;}
.cw{position:relative;border-radius:12px;padding:8px;background:${isDark ? 'rgba(255,255,255,0.012)' : 'rgba(15,23,42,0.018)'};}
.summary{margin-top:22px;background:${cardBg};background-image:${expPanelSubtle};border:1px solid ${bdColor};border-radius:14px;padding:16px;box-shadow:${expElev1};}
.summary-title{font-size:12px;font-weight:800;color:${p2};margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid ${bdColor};text-transform:uppercase;letter-spacing:.06em;}
.summary-scroll,.table-scroll{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;}
.summary-table{width:100%;border-collapse:collapse;font-size:12px;}
.summary-table th{background:linear-gradient(180deg,${p1},${p2});color:#fff;padding:8px 10px;font-size:11px;text-align:left;}
.summary-table th.tr,.summary-table td.tr{text-align:right;}
.summary-table td{padding:7px 10px;border-bottom:1px solid ${bdColor};color:${txt};}
.summary-table .mono{font-family:'DM Mono',monospace;}
.summary-total{background:${isDark ? 'rgba(255,255,255,0.05)' : '#e2e8f0'};font-weight:700;border-top:2px solid ${bdColor};}
.tbl-section{margin-top:22px;background:${cardBg};background-image:${expPanelSubtle};border:1px solid ${bdColor};border-radius:14px;overflow:hidden;box-shadow:${expElev1};}
.tbl-header{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid ${bdColor};background:${isDark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.65)'};}
.st{font-size:13px;font-weight:800;color:${p2};text-transform:uppercase;letter-spacing:.04em;}
.tbl-active{font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(37,99,235,0.2);color:#60a5fa;margin-left:auto;margin-right:8px;}
.tbl-filters{padding:12px 16px;border-bottom:1px solid ${bdColor};background:${isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)'};}
.tbl-compact-row{display:grid;grid-template-columns:minmax(180px,240px) minmax(220px,1fr);gap:10px;}
.tbl-limit{padding:10px 14px;border-top:1px solid ${bdColor};font-size:12px;color:${subTxt};background:${isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'};}
table#mt{width:100%;border-collapse:collapse;font-size:12px;}
table#mt th{background:linear-gradient(180deg,${p1},${p2});color:#fff;padding:10px 12px;font-size:11px;font-weight:800;text-transform:uppercase;white-space:nowrap;letter-spacing:.03em;}
table#mt td{padding:8px 12px;border-bottom:1px solid ${bdColor};color:${txt};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;}
.footer{margin-top:26px;padding:12px 16px;background:${cardBg};background-image:linear-gradient(90deg,${p1}22,transparent),${expPanelSubtle};color:${subTxt};border:1px solid ${bdColor};border-radius:12px;font-size:11px;text-align:center;box-shadow:${expElev1};}
@media(max-width:768px){
  html,body{width:100%;max-width:100%;overflow-x:hidden;}
  body{padding:12px;}
  .wrap{min-width:0;}
  .hd{margin-bottom:1rem;padding:1rem .85rem .95rem;}
  .hd-inner{align-items:flex-start;gap:.75rem;}
  .hd-inner>div:first-child,.hd-badges{width:100%;}
  .hd-title{font-size:clamp(1.25rem,7vw,1.6rem);overflow-wrap:anywhere;}
  .hd-badges{gap:.4rem;}
  .badge{font-size:.66rem;padding:.18rem .5rem;max-width:100%;overflow-wrap:anywhere;}
  .sav{align-items:flex-start;flex-direction:column;padding:18px;margin:14px 0;}
  .sav>div:first-child{width:100%;min-width:0;}
  .sav>div:last-child{display:none;}
  .sav-val{font-size:clamp(26px,8vw,40px);line-height:1.05;overflow-wrap:anywhere;}
  .sav-det{gap:12px 18px;}
  .kpi-row{display:grid;grid-template-columns:1fr;gap:10px;margin:14px 0;}
  .kpi{min-width:0;}
  .kpi-v{font-size:clamp(16px,5vw,18px);overflow-wrap:anywhere;}
  .cg{grid-template-columns:1fr;gap:12px;margin:14px 0;}
  .cc,.summary{padding:12px;border-radius:10px;}
  .cc{min-width:0;}
  .cc.full{grid-column:auto;}
  .ct,.summary-title,.st,.footer{overflow-wrap:anywhere;}
  .cw{min-height:220px;padding:4px;}
  .tbl-header{align-items:flex-start;flex-direction:column;gap:8px;padding:12px;}
  .tbl-active{margin-left:0;margin-right:0;}
  .tbl-filters{padding:12px;}
  .tbl-compact-row{grid-template-columns:1fr;gap:8px;}
  .summary-table,table#mt{font-size:11px;}
  table#mt{min-width:max-content;}
  table#mt th,table#mt td{padding:7px 9px;max-width:160px;}
  .footer{margin-top:18px;padding:10px 12px;}
}
@media(max-width:420px){
  body{padding:8px;}
  .hd-title{font-size:clamp(1.15rem,8vw,1.35rem);}
  .sav{padding:16px 14px;}
  .cc,.summary{padding:10px;}
  .ct{font-size:12px;}
}
</style></head>
<body data-export-mode="${strictParity ? 'strict' : 'compat'}"><div class="wrap">
<div class="hd">
  <div class="hd-accent"></div>
  <div class="hd-inner">
    <div>
      <div class="hd-kicker">Report Flow · Relatório executivo</div>
      <div class="hd-title">${escapeHtml(title || 'Relatório')}</div>
      ${subtitle ? `<div class="hd-sub">${escapeHtml(subtitle)}</div>` : ''}
    </div>
    <div class="hd-badges">
      ${period ? `<span class="badge">${escapeHtml(period)}</span>` : ''}
      ${company ? `<span class="badge">${escapeHtml(company)}</span>` : ''}
      <span class="badge badge-blue">${recordCount.toLocaleString('pt-BR')} registros</span>
    </div>
  </div>
  <div class="hd-divider"></div>
</div>
${insightsHTML}
${savHTML}${kpiHTML}
${showCharts ? '<div class="cg" id="charts"></div>' : ''}
${summaryHTML}
${tblHTML}
${sections?.footer ? `<div class="footer">${escapeHtml(footer || '')} · ${new Date().toLocaleDateString('pt-BR')}</div>` : ''}
</div>
<script>window.REPORT_DATA = ${reportDataJSON};</script>
<script>(function(){
const _isDark = ${isDark ? 'true' : 'false'};
const _charts = ${chartsJSON};
const _pal = _isDark ? ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'] : ['#1d4ed8','#059669','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#4f46e5'];
const _emptyBorder = ${JSON.stringify(bdColor)};
const _emptyBg = ${JSON.stringify(cardBg)};
const _emptyText = ${JSON.stringify(subTxt)};
const cg = document.getElementById('charts');
if (!Array.isArray(_charts) || !_charts.length || !cg || !window.echarts) {
  if (cg) {
    cg.innerHTML = '<div style="grid-column:1/-1;padding:18px 16px;border:1px solid ' + _emptyBorder + ';border-radius:9px;background:' + _emptyBg + ';color:' + _emptyText + ';font-size:13px;">O backend não enviou charts para este relatório.</div>';
  }
  return;
}
function mk(id, full, title, h, reason, sourceDescription){
  const card = document.createElement('div');
  card.className = 'cc' + (full ? ' full' : '');
  const header = document.createElement('div');
  header.className = 'ch';
  const titleWrap = document.createElement('div');
  const titleText = document.createElement('div');
  titleText.className = 'ct';
  titleText.textContent = title || 'Gráfico';
  titleWrap.appendChild(titleText);
  if (reason) {
    const reasonEl = document.createElement('div');
    reasonEl.className = 'ct-reason';
    reasonEl.textContent = reason;
    titleWrap.appendChild(reasonEl);
  }
  if (sourceDescription) {
    const sourceEl = document.createElement('div');
    sourceEl.className = 'ct-source';
    sourceEl.textContent = sourceDescription;
    titleWrap.appendChild(sourceEl);
  }
  const badge = document.createElement('span');
  badge.className = 'ct-badge';
  badge.textContent = 'Gráfico';
  header.appendChild(titleWrap);
  header.appendChild(badge);
  const cw = document.createElement('div');
  cw.className = 'cw';
  cw.style.height = (h || 260) + 'px';
  const target = document.createElement('div');
  target.id = id;
  target.style.width = '100%';
  target.style.height = '100%';
  cw.appendChild(target);
  card.appendChild(header);
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
  const el = mk(item.id, !!item.full, item.title, item.h || 260, item.selectionReason, item.sourceDescription);
  const inst = echarts.init(el);
  if (!item?.option) return;
  inst.setOption(item.option, true);
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

import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildReportHTML } from '../src/lib/reportExport.js'
import { selectMetricCharts } from '../src/lib/chartSelection.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturePath = path.join(__dirname, 'fixtures', 'report-state.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const fixtureWithCharts = fixture
const selectedFixtureCharts = selectMetricCharts(
  fixtureWithCharts.reportData?.charts,
  fixtureWithCharts.reportData?.metric?.type || 'ECONOMIA',
  fixtureWithCharts.rows?.length || 0,
)
const percentFixture = {
  title: 'Saving Percentual',
  subtitle: 'Validacao do modo percentual',
  period: '2026',
  company: 'Acme Brasil',
  cols: [
    { name: 'Fornecedor', type: 'text', vis: true, uniq: 3 },
    { name: 'Valor Pago', type: 'number', vis: true, uniq: 5 },
    { name: 'Saving (%)', type: 'number', vis: true, uniq: 5 },
  ],
  rows: [
    { cells: ['Alpha', '1000', '10'] },
    { cells: ['Alpha', '500', '20'] },
    { cells: ['Beta', '2000', '5'] },
    { cells: ['Beta', '1000', '8'] },
    { cells: ['Gamma', '3000', '8'] },
  ],
  colors: { primary: '#1a3a5c', secondary: '#2e5c8a', accent: '#4ade80', bg: '#eef1f5', text: '#1e293b' },
  sections: { saving: true, kpi: false, charts: true, summary: false, table: false, filters: false, footer: false },
  saving: {
    label: 'Saving Total (R$)',
    savingMode: 'percent_x_base',
    savingPercentCol: '2',
    savingPercentLabel: 'Saving (%)',
    savingBaseCol: '1',
    savingBaseLabel: 'Valor Pago',
  },
  groupCol: '0',
  reportData: {
    metric: {
      type: 'ECONOMIA',
      value: 620,
      label: 'Saving Total',
      color: '#16A34A',
    },
    dataset: {
      aggregations: {
        by_category: { labels: ['Gamma', 'Alpha', 'Beta'], data: [240, 200, 180] },
        by_date: { labels: ['Jan/2026'], d1: [620] },
        top_items: { labels: ['Gamma', 'Alpha', 'Beta'], data: [240, 200, 180] },
        distribution: { labels: ['0-1'], data: [5] },
      },
      summary: {
        group_index: 0,
        rows: [],
        totals: { count: 5, value: 620 },
      },
      kpis: [],
      detail_items: [
        { kind: 'currency', label: 'Valor Pago', value: 6200 },
        { kind: 'percent', label: 'Saving (%)', value: 10, accent: true },
      ],
    },
    charts: [
      {
        id: 'wf',
        title: 'Waterfall direto',
        type: 'bar',
        labels: ['Gamma', 'Alpha', 'Beta'],
        data: [240, 200, 180],
        full: true,
        h: 260,
        option: {
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: ['Gamma', 'Alpha', 'Beta'] },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: [240, 200, 180] }],
        },
      },
    ],
    insights: [],
  },
}

function chartFixture({ source, title, type, labels, data, extra = {} }) {
  return {
    source,
    title,
    type,
    labels,
    data,
    option: {
      series: [{ type: type === 'hbar' ? 'bar' : type, data }],
      xAxis: { type: type === 'hbar' ? 'value' : 'category', data: type === 'hbar' ? undefined : labels },
      yAxis: { type: type === 'hbar' ? 'category' : 'value', data: type === 'hbar' ? labels : undefined },
    },
    ...extra,
  }
}

test.describe('Chart selection heuristic', () => {
  test('prefers temporal data and ranking when category cardinality is high', () => {
    const selected = selectMetricCharts([
      chartFixture({
        source: 'distribution',
        title: 'Distribuição ampla',
        type: 'doughnut',
        labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
        data: [9, 8, 7, 6, 5, 4, 3, 2, 1],
      }),
      chartFixture({
        source: 'by_category',
        title: 'Por Categoria',
        type: 'bar',
        labels: ['Cat 1', 'Cat 2', 'Cat 3', 'Cat 4', 'Cat 5', 'Cat 6', 'Cat 7', 'Cat 8', 'Cat 9', 'Cat 10', 'Cat 11', 'Cat 12'],
        data: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        extra: { totalGroups: 24, truncated: true },
      }),
      chartFixture({
        source: 'by_date',
        title: 'Evolução Mensal',
        type: 'line',
        labels: ['Jan/2026', 'Fev/2026', 'Mar/2026'],
        data: [10, 15, 12],
      }),
      chartFixture({
        source: 'top_items',
        title: 'Top Fornecedores',
        type: 'hbar',
        labels: ['Fornecedor A', 'Fornecedor B', 'Fornecedor C', 'Fornecedor D'],
        data: [40, 30, 20, 10],
        extra: { totalGroups: 24, truncated: true },
      }),
    ], 'ECONOMIA', 40)

    expect(selected).toHaveLength(3)
    expect(selected.map(chart => chart.source)).toEqual(['top_items', 'by_date', 'by_category'])
  })

  test('keeps donut only for few proportional categories and drops insufficient charts', () => {
    const selected = selectMetricCharts([
      chartFixture({
        source: 'by_category',
        title: 'Mix por Categoria',
        type: 'doughnut',
        labels: ['A', 'B', 'C'],
        data: [50, 30, 20],
        extra: { totalGroups: 3 },
      }),
      chartFixture({
        source: 'by_date',
        title: 'Evolução Mensal',
        type: 'line',
        labels: ['Jan/2026'],
        data: [100],
      }),
      chartFixture({
        source: 'top_items',
        title: 'Top Itens',
        type: 'hbar',
        labels: ['A', 'B'],
        data: [80, 20],
      }),
    ], 'TOTAL', 3)

    expect(selected.map(chart => chart.title)).toEqual(['Mix por Categoria', 'Top Itens'])
  })
})

test.describe('Export strict parity snapshots', () => {
  test('export renders the same selected charts used by preview', async ({ page }) => {
    const html = buildReportHTML(fixtureWithCharts, { isDark: false, strictParity: true })
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cg .cc', { timeout: 15000 })

    expect(fixtureWithCharts.reportData.charts).toHaveLength(4)
    expect(selectedFixtureCharts).toHaveLength(3)
    await expect(page.locator('.cg .cc')).toHaveCount(selectedFixtureCharts.length)
    expect(await page.locator('.ct').allTextContents()).toEqual(selectedFixtureCharts.map(chart => chart.title))
  })

  test('strict dark snapshot', async ({ page }) => {
    const html = buildReportHTML(fixtureWithCharts, { isDark: true, strictParity: true })
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cg .cc', { timeout: 15000 })
    await page.waitForTimeout(1200)

    await expect(page.locator('body')).toHaveAttribute('data-export-mode', 'strict')
    await expect(page.locator('.wrap')).toHaveScreenshot('export-strict-dark.png', { animations: 'disabled' })
  })

  test('strict light snapshot', async ({ page }) => {
    const html = buildReportHTML(fixtureWithCharts, { isDark: false, strictParity: true })
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cg .cc', { timeout: 15000 })
    await page.waitForTimeout(1200)

    await expect(page.locator('.wrap')).toHaveScreenshot('export-strict-light.png', { animations: 'disabled' })
  })

  test('percent saving uses backend charts and metric total', async ({ page }) => {
    const html = buildReportHTML(percentFixture, { isDark: false, strictParity: true })
    await page.setContent(html, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('.sav-val')).toContainText('620,00')
    await expect(page.locator('.cg .cc')).toHaveCount(1)
    await expect(page.locator('.ct').first()).toContainText('Waterfall direto')
  })
})

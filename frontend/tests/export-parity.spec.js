import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildChartPayload, buildReportHTML } from '../src/lib/reportExport.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturePath = path.join(__dirname, 'fixtures', 'report-state.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
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
  charts: {
    g1: { on: false },
    g2: { on: false },
    g3: { on: false },
    g4: { on: false },
  },
  groupCol: '0',
}

test.describe('Export strict parity snapshots', () => {
  test('strict dark snapshot', async ({ page }) => {
    const html = buildReportHTML(fixture, { isDark: true, strictParity: true })
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cg .cc', { timeout: 15000 })
    await page.waitForTimeout(1200)

    await expect(page.locator('body')).toHaveAttribute('data-export-mode', 'strict')
    await expect(page.locator('.wrap')).toHaveScreenshot('export-strict-dark.png', { animations: 'disabled' })
  })

  test('strict light snapshot', async ({ page }) => {
    const html = buildReportHTML(fixture, { isDark: false, strictParity: true })
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.cg .cc', { timeout: 15000 })
    await page.waitForTimeout(1200)

    await expect(page.locator('.wrap')).toHaveScreenshot('export-strict-light.png', { animations: 'disabled' })
  })

  test('percent saving uses base value for total and waterfall', async ({ page }) => {
    const charts = buildChartPayload(percentFixture)
    const waterfall = charts.find(item => item.id === 'wf')

    expect(waterfall).toBeTruthy()
    expect(waterfall.labels).toEqual(['Gamma', 'Alpha', 'Beta'])
    expect(waterfall.data).toEqual([240, 200, 180])

    const html = buildReportHTML(percentFixture, { isDark: false, strictParity: true })
    await page.setContent(html, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('.sav-val')).toContainText('620,00')
    await expect(page.locator('.sav-det')).toContainText('Valor Pago')
    await expect(page.locator('.sav-det')).toContainText('Saving (%)')
  })
})

import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildReportHTML } from '../src/lib/reportExport.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturePath = path.join(__dirname, 'fixtures', 'report-state.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

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
})

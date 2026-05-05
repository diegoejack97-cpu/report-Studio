import { test, expect } from '@playwright/test'

const mockUser = {
  id: 1,
  email: 'diego@example.com',
  full_name: 'Diego Teste',
  plan: 'starter',
  plan_limit: 8,
  reports_this_month: 2,
}

const mockReports = [
  {
    id: 101,
    title: 'Relatório de Compras',
    row_count: 128,
    col_count: 12,
    updated_at: '2026-05-04T12:00:00.000Z',
    export_count: 3,
  },
]

const mockPlans = [
  {
    id: 'free',
    name: 'Grátis',
    price_brl: 0,
    reports_per_month: 3,
    included_users: 1,
    extra_user_price_brl: 0,
    features: ['3 relatórios/mês', 'Upload CSV/XLSX'],
    self_service: true,
    highlighted: false,
    segment: 'individual',
    current_plan_ids: [],
  },
  {
    id: 'starter',
    name: 'Individual Lite',
    price_brl: 49,
    reports_per_month: 8,
    included_users: 1,
    extra_user_price_brl: 29,
    features: ['8 relatórios/mês', 'Preview completo'],
    self_service: true,
    highlighted: true,
    segment: 'individual',
    current_plan_ids: ['starter'],
  },
  {
    id: 'pro',
    name: 'Individual Pro',
    price_brl: 129,
    reports_per_month: 30,
    included_users: 3,
    extra_user_price_brl: 39,
    features: ['30 relatórios/mês', 'Suporte prioritário'],
    self_service: true,
    highlighted: false,
    segment: 'individual',
    current_plan_ids: [],
  },
  {
    id: 'business',
    name: 'Individual Plus',
    price_brl: 299,
    reports_per_month: 90,
    included_users: 5,
    extra_user_price_brl: 49,
    features: ['90 relatórios/mês', 'Mais automações'],
    self_service: true,
    highlighted: false,
    segment: 'individual',
    current_plan_ids: [],
  },
]

const mockBillingStatus = {
  current_plan: 'starter',
  reports_this_month: 2,
  plan_limit: 8,
  subscription_status: 'active',
  plan_expires_at: '2026-06-01T00:00:00.000Z',
}

function setupClientState(page) {
  page.addInitScript(({ user }) => {
    localStorage.setItem('rs-theme', JSON.stringify({ state: { dark: false }, version: 0 }))
    localStorage.setItem('rs-auth', JSON.stringify({ state: { token: 'e2e-token', user }, version: 0 }))
    localStorage.setItem('rs-last-activity', String(Date.now()))
  }, { user: mockUser })
}

async function setupApiMocks(page) {
  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const path = url.pathname

    if (method === 'GET' && path === '/auth/me') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) })
      return
    }

    if (method === 'GET' && path === '/reports/') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockReports) })
      return
    }

    if (method === 'GET' && path === '/plans/') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPlans) })
      return
    }

    if (method === 'GET' && path === '/billing/public-config') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ embedded_checkout_enabled: false }),
      })
      return
    }

    if (method === 'GET' && path === '/billing/status') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockBillingStatus) })
      return
    }

    await route.continue()
  })
}

async function expectLightTheme(page) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
}

async function expectBasicContrast(page, pageName) {
  const audit = await page.evaluate(() => {
    const targets = [
      'h1', 'h2', 'h3', 'h4', 'p', 'label',
      'button', 'a.btn-primary', 'a.btn-outline', 'a.btn-ghost',
      'input.input-field', 'select.input-field', 'textarea.input-field',
    ]

    function parseColor(colorValue) {
      if (!colorValue) return null
      const value = colorValue.trim().toLowerCase()

      if (value.startsWith('#')) {
        const hex = value.slice(1)
        if (hex.length === 3) {
          const r = parseInt(hex[0] + hex[0], 16)
          const g = parseInt(hex[1] + hex[1], 16)
          const b = parseInt(hex[2] + hex[2], 16)
          return { r, g, b, a: 1 }
        }
        if (hex.length >= 6) {
          const r = parseInt(hex.slice(0, 2), 16)
          const g = parseInt(hex.slice(2, 4), 16)
          const b = parseInt(hex.slice(4, 6), 16)
          return { r, g, b, a: 1 }
        }
        return null
      }

      const parts = value.match(/[\d.]+/g)?.map(Number) || []
      if (parts.length < 3) return null

      let [r = 0, g = 0, b = 0] = parts
      let a = Number.isFinite(parts[3]) ? parts[3] : 1

      if (value.includes('%')) {
        r = r * 2.55
        g = g * 2.55
        b = b * 2.55
      } else if (Math.max(r, g, b) <= 1) {
        // color(srgb 0..1) ou rgb decimal normalizado.
        r = r * 255
        g = g * 255
        b = b * 255
      }

      return {
        r: Number.isFinite(r) ? r : 0,
        g: Number.isFinite(g) ? g : 0,
        b: Number.isFinite(b) ? b : 0,
        a: Number.isFinite(a) ? a : 1,
      }
    }

    function toLinear(channel) {
      const normalized = channel / 255
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    }

    function luminance(rgb) {
      return (0.2126 * toLinear(rgb.r)) + (0.7152 * toLinear(rgb.g)) + (0.0722 * toLinear(rgb.b))
    }

    function contrastRatio(fg, bg) {
      const l1 = luminance(fg)
      const l2 = luminance(bg)
      const light = Math.max(l1, l2)
      const dark = Math.min(l1, l2)
      return (light + 0.05) / (dark + 0.05)
    }

    function isVisible(el) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false
      }
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }

    function effectiveBackground(el) {
      let node = el
      while (node) {
        const bg = parseColor(getComputedStyle(node).backgroundColor)
        if (bg && bg.a > 0.01) {
          return { r: bg.r, g: bg.g, b: bg.b }
        }
        node = node.parentElement
      }
      return { r: 255, g: 255, b: 255 }
    }

    const checked = []
    for (const selector of targets) {
      for (const el of document.querySelectorAll(selector)) {
        if (!isVisible(el)) continue
        const tag = el.tagName
        const text = (
          tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
            ? (el.value || el.placeholder || el.getAttribute('aria-label') || '')
            : (el.textContent || '')
        ).trim()
        if (!text) continue

        const fg = parseColor(getComputedStyle(el).color)
        if (!fg) continue
        const bg = effectiveBackground(el)
        const ratio = contrastRatio({ r: fg.r, g: fg.g, b: fg.b }, bg)
        const looksWhite = fg.r >= 238 && fg.g >= 238 && fg.b >= 238
        const isLightBg = luminance(bg) >= 0.75

        checked.push({
          selector,
          text: text.slice(0, 80),
          ratio,
          looksWhite,
          isLightBg,
        })
      }
    }

    const issues = checked
      .filter(item => item.ratio < 2.2 || (item.looksWhite && item.isLightBg))
      .slice(0, 25)

    return { totalChecked: checked.length, issues }
  })

  expect(audit.totalChecked).toBeGreaterThan(8)
  expect(
    audit.issues,
    `${pageName}: elementos com contraste ruim ou texto branco em fundo claro:\n${JSON.stringify(audit.issues, null, 2)}`
  ).toEqual([])
}

test.describe('Light mode core screens', () => {
  test.beforeEach(async ({ page }) => {
    setupClientState(page)
    await setupApiMocks(page)
  })

  test('Dashboard renders in light mode with readable text', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectLightTheme(page)
    await expectBasicContrast(page, 'Dashboard')
  })

  test('Editor (upload/preview surface) renders in light mode with readable text', async ({ page }) => {
    await page.goto('/editor')
    await expect(page.getByText('Importar dados')).toBeVisible()
    await expectLightTheme(page)
    await expectBasicContrast(page, 'Editor')
  })

  test('Pricing renders in light mode with readable text', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.getByRole('heading', { name: 'Estrutura de planos' })).toBeVisible()
    await expectLightTheme(page)
    await expectBasicContrast(page, 'Pricing')
  })

  test('Profile renders in light mode with readable text', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Configurações da conta' })).toBeVisible()
    await expectLightTheme(page)
    await expectBasicContrast(page, 'Profile')
  })
})

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: light-mode.spec.js >> Light mode core screens >> Editor (upload/preview surface) renders in light mode with readable text
- Location: tests/light-mode.spec.js:288:3

# Error details

```
Error: Editor: elementos com contraste ruim ou texto branco em fundo claro:
[
  {
    "selector": "button",
    "text": "◀ Edição",
    "ratio": 1.5749178872295717,
    "looksWhite": false,
    "isLightBg": false
  },
  {
    "selector": "button",
    "text": "Preview",
    "ratio": 1.5749178872295717,
    "looksWhite": false,
    "isLightBg": false
  }
]

expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 16

- Array []
+ Array [
+   Object {
+     "isLightBg": false,
+     "looksWhite": false,
+     "ratio": 1.5749178872295717,
+     "selector": "button",
+     "text": "◀ Edição",
+   },
+   Object {
+     "isLightBg": false,
+     "looksWhite": false,
+     "ratio": 1.5749178872295717,
+     "selector": "button",
+     "text": "Preview",
+   },
+ ]
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - button [ref=e5] [cursor=pointer]:
      - img [ref=e6]
    - generic [ref=e9]: Novo Relatório
    - generic [ref=e10]:
      - button "◀ Edição" [ref=e11] [cursor=pointer]
      - button "Preview" [ref=e12] [cursor=pointer]:
        - img [ref=e13]
        - text: Preview
      - button "Modo escuro" [ref=e17] [cursor=pointer]:
        - img [ref=e18]
      - button "Salvar" [ref=e20] [cursor=pointer]:
        - img [ref=e21]
        - text: Salvar
      - button "Exportar HTML" [disabled] [ref=e25]:
        - img [ref=e26]
        - text: Exportar HTML
  - generic [ref=e30]:
    - generic [ref=e31]:
      - img [ref=e33]
      - heading "Importar dados" [level=2] [ref=e35]
      - paragraph [ref=e36]: Carregue seu arquivo para começar a criar o relatório
    - generic [ref=e37] [cursor=pointer]:
      - button "Choose File" [ref=e38]
      - generic [ref=e39]:
        - img [ref=e40]
        - paragraph [ref=e43]: Arraste ou clique para importar
        - paragraph [ref=e44]: XLSX, XLS, CSV, TXT
        - generic [ref=e45]:
          - generic [ref=e46]: XLSX
          - generic [ref=e47]: XLS
          - generic [ref=e48]: CSV
          - generic [ref=e49]: TXT
    - generic [ref=e52]: ou
    - button "Carregar dados de exemplo (60 contratos)" [ref=e54] [cursor=pointer]:
      - img [ref=e55]
      - text: Carregar dados de exemplo (60 contratos)
```

# Test source

```ts
  172 | 
  173 |       if (value.includes('%')) {
  174 |         r = r * 2.55
  175 |         g = g * 2.55
  176 |         b = b * 2.55
  177 |       } else if (Math.max(r, g, b) <= 1) {
  178 |         // color(srgb 0..1) ou rgb decimal normalizado.
  179 |         r = r * 255
  180 |         g = g * 255
  181 |         b = b * 255
  182 |       }
  183 | 
  184 |       return {
  185 |         r: Number.isFinite(r) ? r : 0,
  186 |         g: Number.isFinite(g) ? g : 0,
  187 |         b: Number.isFinite(b) ? b : 0,
  188 |         a: Number.isFinite(a) ? a : 1,
  189 |       }
  190 |     }
  191 | 
  192 |     function toLinear(channel) {
  193 |       const normalized = channel / 255
  194 |       return normalized <= 0.04045
  195 |         ? normalized / 12.92
  196 |         : ((normalized + 0.055) / 1.055) ** 2.4
  197 |     }
  198 | 
  199 |     function luminance(rgb) {
  200 |       return (0.2126 * toLinear(rgb.r)) + (0.7152 * toLinear(rgb.g)) + (0.0722 * toLinear(rgb.b))
  201 |     }
  202 | 
  203 |     function contrastRatio(fg, bg) {
  204 |       const l1 = luminance(fg)
  205 |       const l2 = luminance(bg)
  206 |       const light = Math.max(l1, l2)
  207 |       const dark = Math.min(l1, l2)
  208 |       return (light + 0.05) / (dark + 0.05)
  209 |     }
  210 | 
  211 |     function isVisible(el) {
  212 |       const style = getComputedStyle(el)
  213 |       if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
  214 |         return false
  215 |       }
  216 |       const rect = el.getBoundingClientRect()
  217 |       return rect.width > 0 && rect.height > 0
  218 |     }
  219 | 
  220 |     function effectiveBackground(el) {
  221 |       let node = el
  222 |       while (node) {
  223 |         const bg = parseColor(getComputedStyle(node).backgroundColor)
  224 |         if (bg && bg.a > 0.01) {
  225 |           return { r: bg.r, g: bg.g, b: bg.b }
  226 |         }
  227 |         node = node.parentElement
  228 |       }
  229 |       return { r: 255, g: 255, b: 255 }
  230 |     }
  231 | 
  232 |     const checked = []
  233 |     for (const selector of targets) {
  234 |       for (const el of document.querySelectorAll(selector)) {
  235 |         if (!isVisible(el)) continue
  236 |         const tag = el.tagName
  237 |         const text = (
  238 |           tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
  239 |             ? (el.value || el.placeholder || el.getAttribute('aria-label') || '')
  240 |             : (el.textContent || '')
  241 |         ).trim()
  242 |         if (!text) continue
  243 | 
  244 |         const fg = parseColor(getComputedStyle(el).color)
  245 |         if (!fg) continue
  246 |         const bg = effectiveBackground(el)
  247 |         const ratio = contrastRatio({ r: fg.r, g: fg.g, b: fg.b }, bg)
  248 |         const looksWhite = fg.r >= 238 && fg.g >= 238 && fg.b >= 238
  249 |         const isLightBg = luminance(bg) >= 0.75
  250 | 
  251 |         checked.push({
  252 |           selector,
  253 |           text: text.slice(0, 80),
  254 |           ratio,
  255 |           looksWhite,
  256 |           isLightBg,
  257 |         })
  258 |       }
  259 |     }
  260 | 
  261 |     const issues = checked
  262 |       .filter(item => item.ratio < 2.2 || (item.looksWhite && item.isLightBg))
  263 |       .slice(0, 25)
  264 | 
  265 |     return { totalChecked: checked.length, issues }
  266 |   })
  267 | 
  268 |   expect(audit.totalChecked).toBeGreaterThan(8)
  269 |   expect(
  270 |     audit.issues,
  271 |     `${pageName}: elementos com contraste ruim ou texto branco em fundo claro:\n${JSON.stringify(audit.issues, null, 2)}`
> 272 |   ).toEqual([])
      |     ^ Error: Editor: elementos com contraste ruim ou texto branco em fundo claro:
  273 | }
  274 | 
  275 | test.describe('Light mode core screens', () => {
  276 |   test.beforeEach(async ({ page }) => {
  277 |     setupClientState(page)
  278 |     await setupApiMocks(page)
  279 |   })
  280 | 
  281 |   test('Dashboard renders in light mode with readable text', async ({ page }) => {
  282 |     await page.goto('/dashboard')
  283 |     await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  284 |     await expectLightTheme(page)
  285 |     await expectBasicContrast(page, 'Dashboard')
  286 |   })
  287 | 
  288 |   test('Editor (upload/preview surface) renders in light mode with readable text', async ({ page }) => {
  289 |     await page.goto('/editor')
  290 |     await expect(page.getByText('Importar dados')).toBeVisible()
  291 |     await expectLightTheme(page)
  292 |     await expectBasicContrast(page, 'Editor')
  293 |   })
  294 | 
  295 |   test('Pricing renders in light mode with readable text', async ({ page }) => {
  296 |     await page.goto('/pricing')
  297 |     await expect(page.getByRole('heading', { name: 'Estrutura de planos' })).toBeVisible()
  298 |     await expectLightTheme(page)
  299 |     await expectBasicContrast(page, 'Pricing')
  300 |   })
  301 | 
  302 |   test('Profile renders in light mode with readable text', async ({ page }) => {
  303 |     await page.goto('/profile')
  304 |     await expect(page.getByRole('heading', { name: 'Configurações da conta' })).toBeVisible()
  305 |     await expectLightTheme(page)
  306 |     await expectBasicContrast(page, 'Profile')
  307 |   })
  308 | })
  309 | 
```
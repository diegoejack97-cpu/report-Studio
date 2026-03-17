import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    viewport: { width: 1440, height: 2200 },
    deviceScaleFactor: 1,
  },
})

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useThemeStore = create(
  persist(
    (set, get) => ({
      dark: true,
      toggle() {
        const next = !get().dark
        set({ dark: next })
        applyTheme(next)
      },
      init() { applyTheme(get().dark) },
    }),
    { name: 'rs-theme' }
  )
)

export function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

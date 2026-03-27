import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      hasHydrated: false,
      token: null,
      user: null,

      setAuth: (token, user) => set({ token, user }),
      setHydrated: value => set({ hasHydrated: value }),

      logout: () => {
        set({ token: null, user: null })
        window.location.href = '/login'
      },

      refreshUser: async () => {
        try {
          const { data } = await api.get('/auth/me')
          set({ user: data })
          return data
        } catch {
          get().logout()
        }
      },
    }),
    {
      name: 'rs-auth',
      partialize: s => ({ token: s.token, user: s.user }),
      onRehydrateStorage: () => state => {
        state?.setHydrated(true)
      },
    }
  )
)

export function initAuthSync() {
  useAuthStore.getState().setHydrated(true)

  window.addEventListener('storage', event => {
    if (event.key !== 'rs-auth') return

    if (!event.newValue) {
      useAuthStore.setState({ token: null, user: null })
      return
    }

    try {
      const parsed = JSON.parse(event.newValue)
      useAuthStore.setState({
        token: parsed?.state?.token || null,
        user: parsed?.state?.user || null,
      })
    } catch {
      useAuthStore.setState({ token: null, user: null })
    }
  })
}

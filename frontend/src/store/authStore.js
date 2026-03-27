import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api, { setApiAuthToken } from '@/lib/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      hasHydrated: false,
      token: null,
      user: null,

      setAuth: (token, user) => {
        setApiAuthToken(token)
        set({ token, user })
      },
      setHydrated: value => set({ hasHydrated: value }),

      logout: () => {
        setApiAuthToken(null)
        localStorage.removeItem('rs-last-activity')
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
        setApiAuthToken(state?.token || null)
        state?.setHydrated(true)
      },
    }
  )
)

export function initAuthSync() {
  const { token } = useAuthStore.getState()
  setApiAuthToken(token)
  useAuthStore.getState().setHydrated(true)

  window.addEventListener('storage', event => {
    if (event.key !== 'rs-auth') return

    if (!event.newValue) {
      setApiAuthToken(null)
      useAuthStore.setState({ token: null, user: null })
      return
    }

    try {
      const parsed = JSON.parse(event.newValue)
      const nextToken = parsed?.state?.token || null
      setApiAuthToken(nextToken)
      useAuthStore.setState({
        token: nextToken,
        user: parsed?.state?.user || null,
      })
    } catch {
      setApiAuthToken(null)
      useAuthStore.setState({ token: null, user: null })
    }
  })
}

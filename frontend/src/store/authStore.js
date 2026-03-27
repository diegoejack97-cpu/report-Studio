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

function readPersistedAuth() {
  const stored = localStorage.getItem('rs-auth')
  if (!stored) {
    return { token: null, user: null }
  }

  try {
    const parsed = JSON.parse(stored)
    return {
      token: parsed?.state?.token || null,
      user: parsed?.state?.user || null,
    }
  } catch {
    return { token: null, user: null }
  }
}

export function initAuthSync() {
  const persisted = readPersistedAuth()
  setApiAuthToken(persisted.token)
  useAuthStore.setState({
    token: persisted.token,
    user: persisted.user,
    hasHydrated: true,
  })

  window.addEventListener('storage', event => {
    if (event.key !== 'rs-auth') return

    if (!event.newValue) {
      setApiAuthToken(null)
      useAuthStore.setState({ token: null, user: null })
      return
    }

    try {
      const persistedState = readPersistedAuth()
      setApiAuthToken(persistedState.token)
      useAuthStore.setState({
        token: persistedState.token,
        user: persistedState.user,
        hasHydrated: true,
      })
    } catch {
      setApiAuthToken(null)
      useAuthStore.setState({ token: null, user: null })
    }
  })
}

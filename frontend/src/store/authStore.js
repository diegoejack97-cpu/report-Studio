import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      setAuth: (token, user) => set({ token, user }),

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
    }
  )
)

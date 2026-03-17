import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
})

// Attach JWT token
api.interceptors.request.use(config => {
  const stored = localStorage.getItem('rs-auth')
  if (stored) {
    try {
      const { state } = JSON.parse(stored)
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`
      }
    } catch {}
  }
  return config
})

// Handle 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('rs-auth')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

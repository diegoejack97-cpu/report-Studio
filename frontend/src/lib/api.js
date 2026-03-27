import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30_000,
})

export function setApiAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`
    return
  }

  delete api.defaults.headers.common.Authorization
}

// Attach JWT token
api.interceptors.request.use(config => {
  if (config.headers?.Authorization) {
    return config
  }

  if (api.defaults.headers.common.Authorization) {
    config.headers.Authorization = api.defaults.headers.common.Authorization
    return config
  }

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
      setApiAuthToken(null)
      localStorage.removeItem('rs-last-activity')
      localStorage.removeItem('rs-auth')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

const FALLBACK_APP_URL = 'https://report-studio-zeta.vercel.app'

export function getAppUrl() {
  const configuredUrl = (import.meta.env.VITE_APP_URL || '').trim()
  return (configuredUrl || FALLBACK_APP_URL).replace(/\/+$/, '')
}

export function buildAppUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getAppUrl()}${normalizedPath}`
}

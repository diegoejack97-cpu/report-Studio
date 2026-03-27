import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'
import { useThemeStore } from './store/themeStore'
import { initAuthSync } from './store/authStore'

// Aplica tema salvo ANTES do primeiro render
useThemeStore.getState().init()
initAuthSync()

const qc = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={qc}>
    <App />
    <Toaster position="top-right" toastOptions={{
      style: { background: 'var(--s2)', color: 'var(--tp)', border: '1px solid var(--bd)' }
    }}/>
  </QueryClientProvider>
)

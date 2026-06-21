import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import App from './App'
import { ToastProvider } from './components/Toast'
import { ConfirmProvider } from './components/Confirm'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import { initTheme } from './lib/theme'

initTheme()

// Bump whenever a persisted query payload changes shape. A changed buster makes
// PersistQueryClientProvider discard the localStorage cache on load, so old-shaped
// data (e.g. pre-rename `work_items`) is never rehydrated into newer code.
const CACHE_BUSTER = 'rename-project-detail-2026-06'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24, // keep for a day so offline reopen has data
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

// Persist the cache so reopening the PWA (even offline) shows last-known data.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'vernon-mobile-cache',
})

// Register the service worker from the site root with scope "/m" so it controls
// the app (installable PWA + offline shell). Served via Frappe at /vernon_sw.js.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/vernon_sw.js', { scope: '/m' })
      .catch((err) => console.warn('SW registration failed', err))
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24, buster: CACHE_BUSTER }}
    >
      <BrowserRouter basename="/m">
        <ToastProvider>
          <ConfirmProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>,
)

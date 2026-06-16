import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import App from './App'
import { ToastProvider } from './components/Toast'
import './index.css'

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
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
    >
      <BrowserRouter basename="/m">
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>,
)

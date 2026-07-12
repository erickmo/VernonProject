import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ToastProvider } from './components/Toast'
import { ConfirmProvider } from './components/Confirm'
import { AdvanceProvider } from './components/AdvanceProvider'
import { RejectProvider } from './components/RejectProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import FocusOverlay from './components/FocusOverlay'
import { Fab } from './components/Fab'
import UpdateBanner from './components/UpdateBanner'
import { useBoot } from './hooks/useData'
import './index.css'
import { initTheme } from './lib/theme'

initTheme()

// In-memory query cache only — no localStorage persist. Data is always fetched
// fresh on app load; nothing stale is rehydrated from a previous session.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

// One-time cleanup: drop the old persisted cache left by prior versions.
try {
  window.localStorage.removeItem('vernon-mobile-cache')
} catch {
  /* ignore */
}

// Register the service worker from the site root with scope "/m" so it controls
// the app (installable PWA + offline shell). Served via Frappe at /vernon_sw.js.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/vernon_sw.js', { scope: '/m' })
      .catch((err) => console.warn('SW registration failed', err))
  })
}

// Global chrome (FAB, focus overlay) only once signed in — hidden on the
// splash/login screens, where `boot` is absent.
function AuthedOnly({ children }: { children: React.ReactNode }) {
  const { data: boot } = useBoot()
  return boot ? <>{children}</> : null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/m">
        <ToastProvider>
          <ConfirmProvider>
            <AdvanceProvider>
              <RejectProvider>
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
                <AuthedOnly>
                  <Fab />
                  <UpdateBanner />
                  <FocusOverlay />
                </AuthedOnly>
              </RejectProvider>
            </AdvanceProvider>
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

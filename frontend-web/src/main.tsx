import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import App from './App'
import { ToastProvider } from '@/components/Toast'
import { ConfirmProvider } from '@/components/Confirm'
import { AdvanceProvider } from '@/components/AdvanceProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import './index.css'
import { initTheme } from '@/lib/theme'

initTheme()

const CACHE_BUSTER = 'v1'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
})

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'vernon-web-cache',
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, buster: CACHE_BUSTER }}
    >
      <BrowserRouter basename="/w">
        <ToastProvider>
          <ConfirmProvider>
            <AdvanceProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </AdvanceProvider>
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>,
)

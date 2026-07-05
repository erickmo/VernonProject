import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import App from './App'
import { ToastProvider } from '@/components/Toast'
import { ConfirmProvider } from '@/components/Confirm'
import { AdvanceProvider } from '@/components/AdvanceProvider'
import { RejectProvider } from '@/components/RejectProvider'
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

// Don't persist the big analytics payloads — report/data-health/attendance rows
// can be MBs and silently blow the ~5MB localStorage quota, after which the
// persister drops ALL writes. They refetch fine on demand; everything else
// (boot, dashboards, projects) still persists for instant reloads.
const HEAVY_KEYS = new Set(['report', 'data-health', 'attendance-report'])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: CACHE_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) && !HEAVY_KEYS.has(query.queryKey[0] as string),
        },
      }}
    >
      <BrowserRouter basename="/w">
        <ToastProvider>
          <ConfirmProvider>
            <AdvanceProvider>
              <RejectProvider>
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
              </RejectProvider>
            </AdvanceProvider>
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>,
)

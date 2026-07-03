import { eventsApi } from './api'

declare global {
  interface Window { snap?: { pay: (token: string, opts: Record<string, unknown>) => void } }
}

let loaded: Promise<void> | null = null

async function loadSnap(): Promise<void> {
  if (window.snap) return
  if (loaded) return loaded
  loaded = (async () => {
    const cfg = await eventsApi.payConfig()
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.id = 'midtrans-snap'
      s.src = cfg.snap_js
      s.setAttribute('data-client-key', cfg.client_key)
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load payment script'))
      document.body.appendChild(s)
    })
  })()
  return loaded
}

export async function snapPay(token: string): Promise<'success' | 'pending' | 'error' | 'close'> {
  await loadSnap()
  return new Promise((resolve) => {
    window.snap!.pay(token, {
      onSuccess: () => resolve('success'),
      onPending: () => resolve('pending'),
      onError: () => resolve('error'),
      onClose: () => resolve('close'),
    })
  })
}

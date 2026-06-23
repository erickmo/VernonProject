import { mobileApi } from './api'

// Convert a base64url VAPID public key into the Uint8Array the Push API wants.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

// Request permission (if needed), subscribe, and register with the backend.
// Returns true when a subscription is active afterwards.
export async function subscribeToPush(vapidPublicKey: string): Promise<boolean> {
  if (!pushSupported() || !vapidPublicKey) return false
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return false
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }
  await mobileApi.registerPushSubscription(sub.toJSON())
  return true
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getPushSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  try {
    await sub.unsubscribe()
  } finally {
    await mobileApi.unregisterPushSubscription(endpoint)
  }
}

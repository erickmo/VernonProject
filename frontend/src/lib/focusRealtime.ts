import { io, type Socket } from 'socket.io-client'

// Connect to Frappe's socketio (same pattern as the desk client:
// `io(origin + '/' + sitename, { withCredentials })`, cookie-authenticated).
// The server derives the user from the sid cookie and delivers events published
// with `frappe.publish_realtime(..., user=user)` — we listen for `focus_sync`
// and let the caller refetch. Best-effort: if the socket can't connect (e.g.
// Cloudflare blocks the WS upgrade), the store's poll backstop still syncs.

let socket: Socket | null = null

export function connectFocusRealtime(onSync: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const site = window.location.hostname // site name == host on this deployment
  try {
    socket = io(`${window.location.origin}/${site}`, {
      withCredentials: true,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    })
    socket.on('focus_sync', () => onSync())
  } catch {
    /* realtime unavailable — poll backstop covers it */
    return () => {}
  }
  return () => {
    socket?.off('focus_sync')
    socket?.disconnect()
    socket = null
  }
}

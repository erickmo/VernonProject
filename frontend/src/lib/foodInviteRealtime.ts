import { io, type Socket } from 'socket.io-client'

// Same cookie-authenticated Frappe socketio connection as focusRealtime, but for
// the `food_invite` event the backend publishes to each recipient on create.
// Best-effort: if the socket can't connect (e.g. Cloudflare blocks the WS
// upgrade), the poll backstop in usePendingFoodInvite still surfaces the popup.

let socket: Socket | null = null

export function connectFoodInviteRealtime(onInvite: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const site = window.location.hostname // site name == host on this deployment
  try {
    socket = io(`${window.location.origin}/${site}`, {
      withCredentials: true,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    })
    socket.on('food_invite', () => onInvite())
  } catch {
    return () => {}
  }
  return () => {
    socket?.off('food_invite')
    socket?.disconnect()
    socket = null
  }
}

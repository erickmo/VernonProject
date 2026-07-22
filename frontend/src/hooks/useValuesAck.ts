import { useState } from 'react'
import { todayISO } from '@/lib/format'

const KEY = 'vernon_values_ack'

// Show the VernonCorp welcome once per day: store the ISO date last acknowledged,
// show again on a new day. ponytail: localStorage, no server round-trip.
export function useValuesAck() {
  const today = todayISO()
  const [acked, setAcked] = useState(() => {
    try { return localStorage.getItem(KEY) === today } catch { return true }
  })
  const ack = () => {
    try { localStorage.setItem(KEY, today) } catch { /* private mode: show once per load */ }
    setAcked(true)
  }
  return { needsAck: !acked, ack }
}

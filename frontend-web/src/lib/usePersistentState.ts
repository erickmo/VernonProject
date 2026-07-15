import { useEffect, useState } from 'react'

// String state mirrored to localStorage so a pick survives page refresh.
// ponytail: strings only (all current callers store a project key); widen to
// JSON if a non-string ever needs persisting.
export function usePersistentState(key: string, initial = '') {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) ?? initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      if (value) localStorage.setItem(key, value)
      else localStorage.removeItem(key)
    } catch {
      /* private mode / quota — non-fatal, just don't persist */
    }
  }, [key, value])
  return [value, setValue] as const
}

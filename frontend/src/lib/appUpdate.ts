// App-update detection. Polls version.json for a build id different from the one
// baked into this bundle and flips a one-way `updateAvailable` flag. Framework-
// light singleton store exposed to React via useSyncExternalStore.

import { useEffect, useSyncExternalStore } from 'react'

// State (module-level, app-lifetime). `updateAvailable` only ever flips true.
let updateAvailable = false
let latestVersion: string | null = null
let applying = false

// Stable snapshot: useSyncExternalStore needs referential stability or it
// infinite-loops. Rebuilt only inside setState (below), never in getSnapshot.
let snapshot: { updateAvailable: boolean; latestVersion: string | null; applying: boolean } = {
  updateAvailable,
  latestVersion,
  applying,
}

const listeners = new Set<() => void>()
function emit() {
  for (const cb of listeners) cb()
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function getSnapshot() {
  return snapshot
}

// Rebuild the frozen snapshot and notify, mimicking a setState updater so the
// object identity changes exactly once per real state change.
function setState() {
  snapshot = { updateAvailable, latestVersion, applying }
  emit()
}

async function poll() {
  try {
    const res = await fetch(__VERSION_URL__ + '?_=' + Date.now(), { cache: 'no-store' })
    if (!res.ok) return
    const json = await res.json()
    if (json.buildId && json.buildId !== __BUILD_ID__ && !updateAvailable) {
      updateAvailable = true
      latestVersion = json.version || null
      setState()
    }
  } catch {
    /* offline / non-JSON — ignore, retry next tick */
  }
}

let polling = false
function startPolling() {
  if (polling) return
  polling = true
  poll()
  setInterval(poll, 120_000)
  window.addEventListener('focus', () => poll())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') poll()
  })
  // ponytail: no teardown — this lives for the app's lifetime by design.
}

// Flips a busy flag before reloading so the button gives visible feedback
// instead of looking inert while the navigation is in flight, and a second
// click (double-tap) can't fire a second reload.
const applyUpdate = () => {
  if (applying) return
  applying = true
  setState()
  window.location.reload()
}

export function useAppUpdate() {
  useEffect(() => {
    startPolling()
  }, [])
  return { ...useSyncExternalStore(subscribe, getSnapshot), applyUpdate }
}

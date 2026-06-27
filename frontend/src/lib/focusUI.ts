import { useSyncExternalStore } from 'react'

// Lightweight UI state for the single, app-global focus overlay: whether it's
// open and the task meta to render. Kept in a tiny external store (mirrors the
// focus-timer store) so any screen can openFocusOverlay() and the one mounted
// overlay reacts — no React context/provider boilerplate.

export type FocusMeta = {
  project?: string
  deadlineHuman?: string
  overdue?: boolean
  estimateLabel?: string
  group?: string
}

type FocusUI = { open: boolean; meta?: FocusMeta }

let state: FocusUI = { open: false, meta: undefined }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

// Hoisted (stable) subscribe — an inline arrow would re-subscribe every render
// of a consumer; the 1Hz mini-bar makes that churn real.
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function openFocusOverlay(meta?: FocusMeta) {
  // Reopening from the mini-bar (no meta) keeps the last meta shown.
  state = { open: true, meta: meta ?? state.meta }
  emit()
}

export function closeFocusOverlay() {
  state = { ...state, open: false }
  emit()
}

export function useFocusOverlay(): FocusUI {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

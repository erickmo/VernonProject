import { useSyncExternalStore } from 'react'

// Shared open-state for the global focus overlay: whether it's open and which
// task. Drives BOTH the mobile and web overlays (both frontends import this via
// the shared `@` alias). Task detail (meta) now lives on the timer, so this
// store only tracks which task's overlay is open.

export type FocusMeta = {
  project?: string
  deadlineHuman?: string
  overdue?: boolean
  estimateLabel?: string
  group?: string
}

type FocusUI = { open: boolean; taskId?: string }

let state: FocusUI = { open: false }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

// Hoisted (stable) subscribe — an inline arrow would re-subscribe every render.
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function openFocusOverlay(taskId: string) {
  state = { open: true, taskId }
  emit()
}

export function closeFocusOverlay() {
  state = { ...state, open: false }
  emit()
}

export function useFocusOverlay(): FocusUI {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

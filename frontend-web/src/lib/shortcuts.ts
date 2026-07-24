// Keyboard-shortcut logic for /w. Pure + dependency-free so it unit-tests in
// node (via esbuild). The React hook + overlay live in components/ShortcutsHelp.

export type GlobalAction =
  | { kind: 'help' }
  | { kind: 'palette' }
  | { kind: 'quick' }
  | { kind: 'task' }
  | { kind: 'nav'; to: string }
  | { kind: 'startG' }

// `g` prefix targets (gmail-style go-to nav).
const G_NAV: Record<string, string> = {
  h: '/',
  p: '/projects',
  r: '/review',
  n: '/notes',
  c: '/calendar',
}

/**
 * Resolve a keypress to an action. `pendingG` is true when the previous key was
 * `g` and we're inside the sequence window. Returns null for "ignore". Timing
 * lives in the hook; this is the pure state map (so it's testable in node).
 */
export function resolveGlobalKey(pendingG: boolean, key: string): GlobalAction | null {
  if (pendingG) {
    const to = G_NAV[key]
    return to ? { kind: 'nav', to } : null
  }
  switch (key) {
    case '?': return { kind: 'help' }
    case '/': return { kind: 'palette' }
    case 'c': return { kind: 'quick' }
    case 'n': return { kind: 'task' }
    case 'g': return { kind: 'startG' }
    default: return null
  }
}

/** True when the event target is a text-entry field — shortcuts must not hijack typing. */
export function isEditableTarget(el: EventTarget | null): boolean {
  const t = el as (HTMLElement & { tagName?: string }) | null
  if (!t || !t.tagName) return false
  return /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable === true
}

export type ShortcutGroup = { title: string; rows: { keys: string; label: string }[] }

// Single display source of truth for the `?` cheat-sheet.
export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Anywhere',
    rows: [
      { keys: '?', label: 'Show keyboard shortcuts' },
      { keys: '⌘K / Ctrl K', label: 'Command palette' },
      { keys: '/', label: 'Search (command palette)' },
      { keys: 'c', label: 'Quick create' },
      { keys: 'n', label: 'New task' },
      { keys: 'g then h', label: 'Go to Home' },
      { keys: 'g then p', label: 'Go to Projects' },
      { keys: 'g then r', label: 'Go to Review' },
      { keys: 'g then n', label: 'Go to Notes' },
      { keys: 'g then c', label: 'Go to Calendar' },
      { keys: 'Esc', label: 'Close dialog / drawer' },
    ],
  },
  {
    title: 'When a task is open',
    rows: [
      { keys: 'e', label: 'Edit task' },
      { keys: 'f', label: 'Start / stop focus' },
      { keys: 't', label: 'Set deadline to today' },
      { keys: '⌘S / Ctrl S', label: 'Save (while editing)' },
    ],
  },
]

import type { StatusKey } from './types'

interface StatusMeta {
  label: string
  emoji: string
  // Tailwind utility groups
  pill: string // background + text for the badge
  dot: string // small dot color
  ring: string // left accent border
}

export const STATUS: Record<StatusKey, StatusMeta> = {
  planned: {
    label: 'Planned',
    emoji: '🔵',
    pill: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    dot: 'bg-indigo-500',
    ring: 'border-indigo-400',
  },
  done: {
    label: 'Done',
    emoji: '🟠',
    pill: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    ring: 'border-amber-400',
  },
  checked: {
    label: 'Leader approved',
    emoji: '🔷',
    pill: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
    ring: 'border-sky-400',
  },
  completed: {
    label: 'Owner approved',
    emoji: '✅',
    pill: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    ring: 'border-emerald-400',
  },
  cancelled: {
    label: 'Cancelled',
    emoji: '🚫',
    pill: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
    ring: 'border-rose-400',
  },
}

export const STATUS_ORDER: StatusKey[] = ['planned', 'done', 'checked', 'completed']

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
    emoji: '⚪️',
    pill: 'bg-slate-100 text-slate-600',
    dot: 'bg-slate-400',
    ring: 'border-slate-300',
  },
  done: {
    label: 'Done',
    emoji: '🟠',
    pill: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
    ring: 'border-amber-400',
  },
  checked: {
    label: 'Checked by PL',
    emoji: '🔷',
    pill: 'bg-sky-100 text-sky-700',
    dot: 'bg-sky-500',
    ring: 'border-sky-400',
  },
  completed: {
    label: 'Completed',
    emoji: '✅',
    pill: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
    ring: 'border-emerald-400',
  },
}

export const STATUS_ORDER: StatusKey[] = ['planned', 'done', 'checked', 'completed']

import { AlarmClock, CalendarCheck } from 'lucide-react'
import { todayISO } from '@/lib/format'
import type { MeetingListItem } from '@/lib/types'

// The next un-done meetings coming up (today or later), soonest first, capped at `limit`.
// scheduled_at is ISO "YYYY-MM-DD HH:MM:SS" so string compare/sort is chronological.
export function upcomingMeetings(all: MeetingListItem[], limit = 5): MeetingListItem[] {
  const today = todayISO()
  return all
    .filter((m) => m.scheduled_at != null && m.scheduled_at.slice(0, 10) >= today && m.status !== '✅ Done')
    .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1))
    .slice(0, limit)
}

// "Today 14:00" for today, "Mon 14 Jul · 14:00" otherwise.
function slot(scheduled_at: string): string {
  const date = scheduled_at.slice(0, 10)
  const time = scheduled_at.slice(11, 16)
  if (date === todayISO()) return `Today ${time}`
  const d = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return `${d} · ${time}`
}

// Vibrant, unmissable "you have meetings coming up" banner. Shared by /w Home and /m Today.
// Presentational only — parent passes the already-filtered upcoming meetings + handlers.
export function MeetingReminder({
  meetings,
  onOpen,
  onOpenMeeting,
}: {
  meetings: MeetingListItem[]
  onOpen: () => void
  onOpenMeeting: (m: MeetingListItem) => void
}) {
  const count = meetings.length

  // Calm, always-present "you're clear" card when nothing is coming up.
  if (count === 0) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mb-6 flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400">
          <CalendarCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No meetings coming up</p>
          <p className="mt-0.5 text-xs text-slate-400">You&apos;re all clear — tap to view meetings</p>
        </div>
      </button>
    )
  }

  return (
    <div
      role="alert"
      className="mb-6 flex flex-col gap-3 rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 p-4 text-white shadow-[0_12px_32px_-8px_rgba(244,63,94,0.7)] ring-2 ring-amber-400/50"
    >
      <button type="button" onClick={onOpen} className="flex items-center gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 animate-pulse items-center justify-center rounded-full bg-white/25">
          <AlarmClock className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold uppercase tracking-wide">
            {count === 1 ? 'Upcoming meeting' : `${count} upcoming meetings`} · don&apos;t miss it
          </p>
          <p className="mt-0.5 text-xs font-medium text-amber-50">Tap to view all your meetings</p>
        </div>
      </button>

      <ul className="flex flex-col gap-1.5">
        {meetings.map((m) => (
          <li key={m.name}>
            <button
              type="button"
              onClick={() => onOpenMeeting(m)}
              className="flex w-full items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-left backdrop-blur-sm transition active:bg-white/30"
            >
              <span className="shrink-0 tabular-nums text-sm font-bold">
                {m.scheduled_at ? slot(m.scheduled_at) : '--:--'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

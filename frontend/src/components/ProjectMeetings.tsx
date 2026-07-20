import { useState } from 'react'
import { Plus, Check, Users, CalendarClock, Pencil, AlarmClock, CalendarCheck } from 'lucide-react'
import { useMeetings, useReopenMeeting, useBoot } from '@/hooks/useData'
import { CreateMeetingSheet } from '@/components/CreateMeetingSheet'
import { MeetingSheet } from '@/components/MeetingSheet'
import { slot } from '@/components/MeetingReminder'
import { MarkDoneSheet } from '@/components/MarkDoneSheet'
import { GoogleCalButton } from '@/components/GoogleCalButton'
import { EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import type { MeetingListItem } from '@/lib/types'

// Past = already done, or its scheduled time has passed. A scheduled meeting
// with no date stays Upcoming (it isn't done and hasn't slipped by).
const isPast = (m: MeetingListItem) =>
  m.status === '✅ Done' ||
  (!!m.scheduled_at && new Date(m.scheduled_at.replace(' ', 'T')) < new Date())

export function ProjectMeetings({ project, canManage }: { project: string; canManage: boolean }) {
  const toast = useToast()
  const meetings = useMeetings(project)
  const reopen = useReopenMeeting()
  const { data: boot } = useBoot()
  const me = boot?.user
  const [sheet, setSheet] = useState(false)
  const [edit, setEdit] = useState<MeetingListItem | null>(null)
  const [markDone, setMarkDone] = useState<MeetingListItem | null>(null)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  const all = meetings.data?.meetings ?? []
  const past = all.filter(isPast)
  const upcoming = all.filter((m) => !isPast(m))
  const shown = tab === 'upcoming' ? upcoming : past

  const onReopen = (name: string) =>
    reopen.mutate(name, {
      onSuccess: (r) => toast('success', r.message),
      onError: (e) => toast('error', (e as Error).message),
    })

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
          <CalendarClock className="h-4 w-4" /> Meetings
        </h3>
        {canManage && (
          <button
            onClick={() => setSheet(true)}
            className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" /> Meeting
          </button>
        )}
      </div>

      <div className="mb-2.5 flex gap-1.5">
        {([
          ['upcoming', `Upcoming ${upcoming.length}`],
          ['past', `Past ${past.length}`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === key ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length ? (
        <div className="flex flex-col gap-3">
          {shown.map((m) => {
            const past = isPast(m)
            return (
            <div
              key={m.name}
              className={
                past
                  ? 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-sm'
                  : 'rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 p-3 text-white shadow-[0_12px_32px_-8px_rgba(244,63,94,0.5)]'
              }
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    past ? 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400' : 'bg-white/25 text-white'
                  }`}
                >
                  {past ? <CalendarCheck className="h-5 w-5" /> : <AlarmClock className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-bold ${past ? 'text-slate-900 dark:text-slate-50' : 'text-white'}`}>{m.title}</p>
                  <p className={`mt-0.5 text-xs font-semibold tabular-nums ${past ? 'text-slate-400 dark:text-slate-500' : 'text-amber-50'}`}>
                    {m.scheduled_at ? slot(m.scheduled_at) : 'No date'}
                  </p>
                </div>
                {m.organizer === me && (
                  <button
                    onClick={() => setEdit(m)}
                    aria-label="Edit meeting"
                    className={`shrink-0 rounded-lg p-1 ${past ? 'text-slate-400 dark:text-slate-500 active:bg-slate-100 dark:active:bg-slate-700' : 'text-white/80 active:bg-white/20'}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5 text-xs ${past ? 'text-slate-500' : 'font-medium text-amber-50'}`}>
                <span>{m.status}</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> {m.participants.length}
                </span>
                <span>{Math.round(m.point)} pts each</span>
              </div>
              <GoogleCalButton meeting={m} className="mt-2" />
              {m.can_mark_done && (
                <div className={`mt-3 border-t pt-3 ${past ? 'border-slate-100 dark:border-slate-800' : 'border-white/25'}`}>
                  {m.status === '✅ Done' ? (
                    <button onClick={() => onReopen(m.name)} className={`text-sm font-semibold ${past ? 'text-slate-500' : 'text-white/90'}`}>
                      Reopen
                    </button>
                  ) : (
                    <button
                      onClick={() => setMarkDone(m)}
                      className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold ${past ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'bg-white/20 text-white active:bg-white/30'}`}
                    >
                      <Check className="h-4 w-4" /> Mark done &amp; award points
                    </button>
                  )}
                </div>
              )}
            </div>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={CalendarClock} title={tab === 'upcoming' ? 'No upcoming meetings' : 'No past meetings'} />
      )}

      <CreateMeetingSheet open={sheet} onClose={() => setSheet(false)} project={project} />
      <MeetingSheet meeting={edit} onClose={() => setEdit(null)} />
      <MarkDoneSheet meeting={markDone} onClose={() => setMarkDone(null)} />
    </section>
  )
}

import { useState } from 'react'
import { Video, Users, Plus, Pencil, AlarmClock, CalendarCheck } from 'lucide-react'
import { useMeetings, useReopenMeeting, useBoot } from '@/hooks/useData'
import { Section } from '@web/components/Page'
import { Button } from '@web/components/ui'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { CreateMeetingDialog } from '@web/components/CreateMeetingDialog'
import { MeetingSheet } from '@/components/MeetingSheet'
import { slot } from '@/components/MeetingReminder'
import { MarkDoneSheet } from '@/components/MarkDoneSheet'
import { GoogleCalButton } from '@/components/GoogleCalButton'
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
  const [dialog, setDialog] = useState(false)
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
    <Section
      title={<span className="inline-flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Meetings</span>}
      actions={
        canManage ? (
          <Button variant="primary" size="sm" onClick={() => setDialog(true)}>
            <Plus className="h-3.5 w-3.5" /> Meeting
          </Button>
        ) : undefined
      }
    >
      <div className="mb-3 flex gap-1.5">
        {([
          ['upcoming', `Upcoming ${upcoming.length}`],
          ['past', `Past ${past.length}`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === key ? 'bg-brand-600 text-white' : 'bg-canvas text-muted dark:text-slate-400 hover:bg-hover/[0.04]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {meetings.isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : shown.length === 0 ? (
        <EmptyState icon={Video} title={tab === 'upcoming' ? 'No upcoming meetings' : 'No past meetings'} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((m) => {
            const past = isPast(m)
            return (
            <div
              key={m.name}
              className={
                past
                  ? 'rounded-2xl bg-surface p-3 shadow-card'
                  : 'rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 p-3 text-white shadow-[0_12px_32px_-8px_rgba(244,63,94,0.5)]'
              }
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    past ? 'bg-canvas text-muted' : 'bg-white/25 text-white'
                  }`}
                >
                  {past ? <CalendarCheck className="h-5 w-5" /> : <AlarmClock className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-bold ${past ? 'text-ink' : 'text-white'}`}>{m.title}</p>
                  <p className={`mt-0.5 text-xs font-semibold tabular-nums ${past ? 'text-muted' : 'text-amber-50'}`}>
                    {m.scheduled_at ? slot(m.scheduled_at) : 'No date'}
                  </p>
                </div>
                {m.organizer === me && (
                  <button
                    onClick={() => setEdit(m)}
                    aria-label="Edit meeting"
                    className={`shrink-0 rounded-lg p-1.5 transition ${past ? 'text-muted hover:bg-hover/[0.04]' : 'text-white/80 hover:bg-white/20'}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5 text-xs ${past ? 'text-muted' : 'font-medium text-amber-50'}`}>
                <span>{m.status}</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {m.participants.length} invited
                </span>
                <span>{Math.round(m.point)} pts each</span>
              </div>
              <div className="mt-2">
                <GoogleCalButton meeting={m} />
              </div>
              {m.can_mark_done && (
                <div className={`mt-3 border-t pt-3 ${past ? 'border-line' : 'border-white/25'}`}>
                  {m.status === '✅ Done' ? (
                    <button onClick={() => onReopen(m.name)} className={`text-sm font-semibold active:scale-[0.99] ${past ? 'text-muted' : 'text-white/90'}`}>
                      Reopen
                    </button>
                  ) : (
                    <button
                      onClick={() => setMarkDone(m)}
                      className={`w-full rounded-xl py-2.5 text-sm font-semibold transition active:scale-[0.99] ${past ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'bg-white/20 text-white hover:bg-white/30'}`}
                    >
                      Mark done &amp; award
                    </button>
                  )}
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}

      {canManage && <CreateMeetingDialog open={dialog} onClose={() => setDialog(false)} project={project} />}
      <MeetingSheet meeting={edit} onClose={() => setEdit(null)} />
      <MarkDoneSheet meeting={markDone} onClose={() => setMarkDone(null)} />
    </Section>
  )
}

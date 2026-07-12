import { useMemo, useState } from 'react'
import { X, Check, Users } from 'lucide-react'
import type { MeetingListItem, Opt2 } from '@/lib/types'
import { MultiSelectSearch } from './MultiSelectSearch'
import { useMarkMeetingDone, useMeetingInvitableUsers } from '@/hooks/useData'
import { useToast } from './Toast'

// Attendance + points picker shown when finishing a meeting. Invited participants
// come pre-checked; uncheck no-shows, and add anyone who turned up uninvited.
// Points go to exactly the resulting set — the invited list itself is untouched.
export function MarkDoneSheet({
  meeting,
  onClose,
  onDone,
}: {
  meeting: MeetingListItem | null
  onClose: () => void
  onDone?: () => void
}) {
  const toast = useToast()
  const markDone = useMarkMeetingDone()
  const invitable = useMeetingInvitableUsers(meeting ? meeting.project : '')

  // Attendance of invited participants — keyed by user, default present.
  const [present, setPresent] = useState<Record<string, boolean>>({})
  const [extra, setExtra] = useState<string[]>([])
  // Seed `present` once the meeting is known (component stays mounted, so key off name).
  const [seeded, setSeeded] = useState<string | null>(null)
  if (meeting && seeded !== meeting.name) {
    setPresent(Object.fromEntries(meeting.participants.map((u) => [u, true])))
    setExtra([])
    setSeeded(meeting.name)
  }

  const nameOf = useMemo(() => {
    const map: Record<string, string> = {}
    for (const u of invitable.data?.users ?? []) map[u.user] = u.full_name || u.user
    return map
  }, [invitable.data])

  if (!meeting) return null
  const m = meeting

  // Team members who weren't invited — offered as "also attended".
  const extraOptions: Opt2[] = (invitable.data?.users ?? [])
    .filter((u) => !m.participants.includes(u.user))
    .map((u) => ({ value: u.user, label: u.full_name || u.user }))

  const awardees = [...m.participants.filter((u) => present[u]), ...extra]

  const submit = () =>
    markDone.mutate(
      { meeting: m.name, awardees },
      {
        onSuccess: () => {
          toast('success', awardees.length ? `Done — points to ${awardees.length}` : 'Marked done (no points)')
          onDone?.()
          onClose()
        },
        onError: (e) => toast('error', (e as Error).message),
      },
    )

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Who attended?</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">Points go only to selected members.</p>

        {m.participants.length > 0 ? (
          <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
            {m.participants.map((u) => {
              const on = !!present[u]
              return (
                <li key={u}>
                  <button
                    onClick={() => setPresent((p) => ({ ...p, [u]: !p[u] }))}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-700/50"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className={`flex-1 text-sm ${on ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 line-through'}`}>
                      {nameOf[u] || u}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-slate-500">No invited participants — add whoever attended below.</p>
        )}

        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Users className="h-3.5 w-3.5" /> Also attended (not invited)
        </label>
        <MultiSelectSearch value={extra} onChange={setExtra} options={extraOptions} placeholder="Add attendees…" />

        <button
          onClick={submit}
          disabled={markDone.isPending}
          className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          Mark done · award {awardees.length} member{awardees.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  )
}

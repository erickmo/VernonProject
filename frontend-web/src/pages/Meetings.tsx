import { useState } from 'react'
import { useProjects, useMeetings, useMarkMeetingDone, useReopenMeeting } from '@/hooks/useData'
import { SearchableSelect } from '@/components/SearchableSelect'
import { formatDate } from '@/lib/format'
import { useToast } from '@/components/Toast'
import { CreateMeetingDialog } from '../components/CreateMeetingDialog'

export function Meetings() {
  const toast = useToast()
  const projects = useProjects()
  const [project, setProject] = useState('')
  const [dialog, setDialog] = useState(false)
  const meetings = useMeetings(project || undefined)
  const markDone = useMarkMeetingDone()
  const reopen = useReopenMeeting()

  const projectOptions = (projects.data ?? []).map((p) => ({
    value: p.name,
    label: p.project_name ?? p.name,
  }))

  const onDone = (name: string) =>
    markDone.mutate(name, {
      onSuccess: (r) => toast('success', r.message),
      onError: (e) => toast('error', (e as Error).message),
    })
  const onReopen = (name: string) =>
    reopen.mutate(name, {
      onSuccess: (r) => toast('success', r.message),
      onError: (e) => toast('error', (e as Error).message),
    })

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Meetings</h1>
        <button
          disabled={!project}
          onClick={() => setDialog(true)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          New meeting
        </button>
      </div>

      <div className="mb-6 max-w-sm">
        <SearchableSelect value={project} onChange={setProject} options={projectOptions} placeholder="Pick a project…" />
      </div>

      <div className="flex flex-col gap-3">
        {(meetings.data?.meetings ?? []).map((m) => (
          <div key={m.name} className="flex items-center justify-between rounded-xl border border-line p-4">
            <div>
              <div className="font-semibold text-ink">{m.title}</div>
              <div className="text-xs text-muted">
                {m.scheduled_at && (
                  <>{formatDate(m.scheduled_at)}{m.scheduled_at.length > 10 ? ` ${m.scheduled_at.slice(11, 16)}` : ''} · </>
                )}
                {m.participants.length} invited · {Math.round(m.point)} pts each · {m.status}
              </div>
            </div>
            {m.can_mark_done &&
              (m.status === '✅ Done' ? (
                <button onClick={() => onReopen(m.name)} className="text-sm font-semibold text-muted">
                  Reopen
                </button>
              ) : (
                <button onClick={() => onDone(m.name)} className="rounded-lg bg-brand-50 dark:bg-brand-500/15 px-3 py-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
                  Mark done & award
                </button>
              ))}
          </div>
        ))}
      </div>

      {project && <CreateMeetingDialog open={dialog} onClose={() => setDialog(false)} project={project} />}
    </div>
  )
}

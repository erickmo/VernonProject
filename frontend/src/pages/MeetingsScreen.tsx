import { useState } from 'react'
import { Plus, Check, Users } from 'lucide-react'
import { useProjects } from '@/hooks/useData'
import { useMeetings, useMarkMeetingDone, useReopenMeeting } from '@/hooks/useData'
import { SearchableSelect } from '@/components/SearchableSelect'
import { CreateMeetingSheet } from '@/components/CreateMeetingSheet'
import { useToast } from '@/components/Toast'

export function MeetingsScreen() {
  const toast = useToast()
  const projects = useProjects()
  const [project, setProject] = useState('')
  const [sheet, setSheet] = useState(false)
  const meetings = useMeetings(project || undefined)
  const markDone = useMarkMeetingDone()
  const reopen = useReopenMeeting()

  const projectOptions = (projects.data ?? []).map((p) => ({
    value: p.name,
    label: p.project_name,
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
    <div className="mx-auto max-w-xl px-4 pb-24 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Meetings</h1>
        <button
          disabled={!project}
          onClick={() => setSheet(true)}
          className="flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> New
        </button>
      </div>

      <div className="mb-4">
        <SearchableSelect
          value={project}
          onChange={setProject}
          options={projectOptions}
          placeholder="Pick a project…"
        />
      </div>

      {!project && (
        <p className="text-sm text-slate-500">Select a project to see its meetings.</p>
      )}

      <div className="flex flex-col gap-3">
        {(meetings.data?.meetings ?? []).map((m) => (
          <div key={m.name} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900 dark:text-slate-50">{m.title}</span>
              <span className="text-xs text-slate-500">{m.status}</span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {m.participants.length}
              </span>
              <span>{Math.round(m.point)} pts each</span>
              {m.scheduled_at && <span>{m.scheduled_at}</span>}
            </div>
            {m.can_mark_done && (
              <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                {m.status === '✅ Done' ? (
                  <button
                    onClick={() => onReopen(m.name)}
                    className="text-sm font-semibold text-slate-500"
                  >
                    Reopen
                  </button>
                ) : (
                  <button
                    onClick={() => onDone(m.name)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-50 dark:bg-brand-500/15 py-2.5 text-sm font-semibold text-brand-700 dark:text-brand-300"
                  >
                    <Check className="h-4 w-4" /> Mark done &amp; award points
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {project && (
        <CreateMeetingSheet open={sheet} onClose={() => setSheet(false)} project={project} />
      )}
    </div>
  )
}

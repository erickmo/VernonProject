import { useState } from 'react'
import { Page } from '@web/components/Page'
import { Card, CardList } from '@web/components/Card'
import { useProjects, useMeetings, useReopenMeeting } from '@/hooks/useData'
import { SearchableSelect } from '@/components/SearchableSelect'
import { formatDate } from '@/lib/format'
import { useToast } from '@/components/Toast'
import { CreateMeetingDialog } from '../components/CreateMeetingDialog'
import { MarkDoneSheet } from '@/components/MarkDoneSheet'
import type { MeetingListItem } from '@/lib/types'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState, Button } from '@web/components/ui'
import { Video, Users, Clock } from 'lucide-react'

export function Meetings() {
  const toast = useToast()
  const projects = useProjects()
  const [project, setProject] = useState('')
  const [dialog, setDialog] = useState(false)
  const [markDoneMeeting, setMarkDoneMeeting] = useState<MeetingListItem | null>(null)
  const meetings = useMeetings(project || undefined)
  const reopen = useReopenMeeting()

  // meetings can only be scheduled for unclosed (Ongoing) projects
  const projectOptions = (projects.data ?? [])
    .filter((p) => p.status !== 'Closed')
    .map((p) => ({
      value: p.name,
      label: p.project_name ?? p.name,
    }))

  const onReopen = (name: string) =>
    reopen.mutate(name, {
      onSuccess: (r) => toast('success', r.message),
      onError: (e) => toast('error', (e as Error).message),
    })

  return (
    <Page>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Meetings</h1>
        <Button variant="primary" disabled={!project} onClick={() => setDialog(true)}>
          New meeting
        </Button>
      </div>

      <div className="mb-6 max-w-sm">
        <SearchableSelect value={project} onChange={setProject} options={projectOptions} placeholder="Pick a project…" />
      </div>

      {meetings.isError ? (
        <ErrorState onRetry={() => meetings.refetch()} />
      ) : meetings.isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (meetings.data?.meetings ?? []).length === 0 ? (
        <EmptyState icon={Video} title="No meetings" subtitle={project ? 'No meetings for this project yet.' : 'Pick a project to see its meetings.'} />
      ) : (
      <CardList>
        {(meetings.data?.meetings ?? []).map((m) => (
          <Card
            key={m.name}
            title={m.title}
            meta={
              <>
                {m.scheduled_at && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(m.scheduled_at)}{m.scheduled_at.length > 10 ? ` ${m.scheduled_at.slice(11, 16)}` : ''}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {m.participants.length} invited
                </span>
                <span>{Math.round(m.point)} pts each</span>
                <span>{m.status}</span>
              </>
            }
            footer={
              m.can_mark_done
                ? m.status === '✅ Done'
                  ? (
                    <button onClick={() => onReopen(m.name)} className="text-sm font-semibold text-muted active:scale-[0.99]">
                      Reopen
                    </button>
                  )
                  : (
                    <button
                      onClick={() => setMarkDoneMeeting(m)}
                      className="w-full rounded-xl bg-brand-50 dark:bg-brand-500/15 py-2.5 text-sm font-semibold text-brand-700 dark:text-brand-300 transition active:scale-[0.99]"
                    >
                      Mark done & award
                    </button>
                  )
                : undefined
            }
          />
        ))}
      </CardList>
      )}

      {project && <CreateMeetingDialog open={dialog} onClose={() => setDialog(false)} project={project} />}
      <MarkDoneSheet meeting={markDoneMeeting} onClose={() => setMarkDoneMeeting(null)} />
    </Page>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { ErrorState, Button } from '@web/components/ui'
import { useBoot, canManageUsers, useFeedbackInbox, useSetFeedbackStatus } from '@/hooks/useData'
import FeedbackMessage from '@/components/FeedbackMessage'
import { useFeedbackToTask } from '@/hooks/useFeedbackToTask'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Drawer } from '@web/components/overlays/Drawer'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'

const STATUSES = ['New', 'Reviewed', 'Resolved', 'Rejected'] as const
const FILTERS = ['All', ...STATUSES] as const

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? 'bg-brand-600 text-white'
      : 'bg-canvas text-muted hover:bg-hover/[0.04] dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
  }`

const TYPE_TONE: Record<string, string> = {
  Criticism: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  Suggestion: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Praise: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Bug: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}

const STATUS_TONE: Record<string, string> = {
  New: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
  Reviewed: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  Resolved: 'bg-canvas text-muted dark:bg-slate-700 dark:text-slate-300',
  Rejected: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
}

const pill = (cls: string) =>
  `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`

export default function FeedbackInbox() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const [filter, setFilter] = useState<string>('All')
  const list = useFeedbackInbox(filter === 'All' ? undefined : filter)
  const setStatus = useSetFeedbackStatus()
  const toast = useToast()
  const flow = useFeedbackToTask()

  const blocked = !!boot && !canManageUsers(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (bootLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (blocked) return null

  const items = list.data?.items ?? []

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Feedback</h1>

      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/feedback')}
          className="rounded-full px-3 py-1.5 text-sm font-medium bg-hover/[0.05] text-muted hover:bg-hover/[0.1]"
        >
          Send
        </button>
        <button className="rounded-full px-3 py-1.5 text-sm font-medium bg-brand-600 text-white">Inbox</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={chip(filter === f)}>
            {f}
          </button>
        ))}
      </div>

      {list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title="No feedback" subtitle="Nothing to triage here yet." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.name}
              className="rounded-lg border border-line bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={pill(TYPE_TONE[item.feedback_type] ?? STATUS_TONE.Resolved)}>
                      {item.feedback_type}
                    </span>
                    <span className={pill(STATUS_TONE[item.status] ?? STATUS_TONE.Resolved)}>
                      {item.status}
                    </span>
                    {!item.is_anonymous && (
                      <span className="text-xs text-muted">{item.submitter}</span>
                    )}
                    <span className="text-xs text-muted">· {item.at_human}</span>
                    {item.linked_todo && (
                      <button
                        onClick={() => navigate('/project-item/' + item.linked_todo)}
                        className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                      >
                        View task →
                      </button>
                    )}
                  </div>
                  <FeedbackMessage message={item.message} className="text-sm text-ink" />
                </div>
                {(item.status === 'New' || item.status === 'Reviewed') && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => flow.start(item)}
                      className="rounded-full px-2.5 py-1 text-xs font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
                    >
                      Create task
                    </button>
                    <button
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate(
                          { name: item.name, status: 'Resolved' },
                          { onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not update') },
                        )
                      }
                      className="rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate(
                          { name: item.name, status: 'Rejected' },
                          { onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not update') },
                        )
                      }
                      className="rounded-full px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Drawer
        open={flow.picking}
        onClose={flow.cancel}
        title="Create task from feedback"
        footer={
          <>
            <Button variant="ghost" onClick={flow.cancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!(flow.detail && flow.detailData)}
              onClick={flow.openDialog}
            >
              Continue
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted">Project</label>
            <SearchableSelect
              value={flow.project}
              onChange={flow.chooseProject}
              options={flow.projectCards.map((p) => ({ value: p.name, label: p.project_name }))}
              placeholder="Select a project…"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted">Detail</label>
            <SearchableSelect
              value={flow.detail}
              onChange={flow.chooseDetail}
              options={flow.projectDetails.map((d) => ({ value: d.name, label: d.title }))}
              placeholder="Select a detail…"
            />
          </div>
        </div>
      </Drawer>

      {flow.dialogOpen && flow.detailData && (
        <CreateProjectItemDialog
          open
          onClose={flow.cancel}
          projectDetail={flow.detail}
          team={flow.detailData.team.map((t) => ({ user: t.user, name: t.name }))}
          defaultGroup={flow.detailData.default_group ?? null}
          initial={flow.initial}
          onCreated={flow.onCreated}
        />
      )}
    </div>
  )
}

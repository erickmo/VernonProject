import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, FilterChips } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageUsers, useFeedbackInbox, useSetFeedbackStatus } from '@/hooks/useData'
import { useFeedbackToTask } from '@/hooks/useFeedbackToTask'
import { SearchableSelect } from '@/components/SearchableSelect'
import { CreateProjectItemSheet } from '@/components/CreateProjectItemSheet'
import FeedbackMessage from '@/components/FeedbackMessage'

type StatusFilter = 'All' | 'New' | 'Reviewed' | 'Resolved' | 'Rejected'

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'New', label: 'New' },
  { value: 'Reviewed', label: 'Reviewed' },
  { value: 'Resolved', label: 'Resolved' },
  { value: 'Rejected', label: 'Rejected' },
]

const TYPE_TONE: Record<string, string> = {
  Criticism: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  Suggestion: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Praise: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Bug: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}

const STATUS_TONE: Record<string, string> = {
  New: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
  Reviewed: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  Resolved: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  Rejected: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
}

const pill = (cls: string) =>
  `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`

export default function FeedbackInboxScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const [filter, setFilter] = useState<StatusFilter>('All')
  const list = useFeedbackInbox(filter === 'All' ? undefined : filter)
  const setStatus = useSetFeedbackStatus()
  const flow = useFeedbackToTask()
  const toast = useToast()

  const blocked = !boot ? false : !canManageUsers(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (bootLoading) {
    return (
      <DetailScreen title="Feedback Inbox">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }
  if (blocked) return null

  const items = list.data?.items ?? []

  return (
    <DetailScreen title="Feedback Inbox">
      <FilterChips options={FILTER_OPTIONS} value={filter} onChange={setFilter} />

      <div className="mt-4">
        {list.isLoading ? (
          <Spinner className="mx-auto h-5 w-5 text-slate-400" />
        ) : list.isError ? (
          <EmptyState icon={Inbox} title="Could not load feedback" subtitle="Go back and try again." />
        ) : items.length === 0 ? (
          <EmptyState icon={Inbox} title="No feedback" subtitle="Nothing to triage here yet." />
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div
                key={item.name}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-start gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={pill(TYPE_TONE[item.feedback_type] ?? STATUS_TONE.Resolved)}>
                        {item.feedback_type}
                      </span>
                      <span className={pill(STATUS_TONE[item.status] ?? STATUS_TONE.Resolved)}>
                        {item.status}
                      </span>
                      {!item.is_anonymous && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">{item.submitter}</span>
                      )}
                      <span className="text-xs text-slate-400 dark:text-slate-500">· {item.at_human}</span>
                    </div>
                    <FeedbackMessage message={item.message} className="text-sm text-slate-700 dark:text-slate-200" />
                  </div>
                  {(item.status === 'New' || item.status === 'Reviewed') && (
                    <div className="flex shrink-0 flex-col gap-1.5">
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
                      <button
                        onClick={() => flow.start(item)}
                        className="rounded-full px-2.5 py-1 text-xs font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
                      >
                        Create task
                      </button>
                    </div>
                  )}
                </div>
                {item.linked_todo && (
                  <button
                    onClick={() => navigate('/project-item/' + item.linked_todo)}
                    className="mt-2 text-xs font-medium text-brand-600 dark:text-brand-400"
                  >
                    View task →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {flow.picking && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={flow.cancel}>
          <div
            className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-50">Create task from feedback</h3>
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Project
                <SearchableSelect
                  value={flow.project}
                  onChange={flow.chooseProject}
                  options={flow.projectCards.map((p) => ({ value: p.name, label: p.project_name }))}
                  placeholder="Select a project…"
                />
              </label>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Detail
                <SearchableSelect
                  value={flow.detail}
                  onChange={flow.chooseDetail}
                  options={flow.projectDetails.map((d) => ({ value: d.name, label: d.title }))}
                  placeholder="Select a detail…"
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={flow.cancel}
                  className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 active:scale-95 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={flow.openDialog}
                  disabled={!flow.detail || !flow.detailData}
                  className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {flow.dialogOpen && flow.detailData && (
        <CreateProjectItemSheet
          open
          onClose={flow.cancel}
          projectDetail={flow.detail}
          team={flow.detailData.team.map((t) => ({ user: t.user, name: t.name }))}
          defaultGroup={flow.detailData.default_group ?? null}
          initial={flow.initial}
          onCreated={flow.onCreated}
        />
      )}
    </DetailScreen>
  )
}

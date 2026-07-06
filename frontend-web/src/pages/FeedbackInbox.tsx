import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState, OverflowMenu } from '@web/components/ui'
import { useBoot, canManageUsers, useFeedbackInbox, useSetFeedbackStatus } from '@/hooks/useData'

const STATUSES = ['New', 'Reviewed', 'Resolved'] as const
const FILTERS = ['All', ...STATUSES] as const

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? 'bg-brand-600 text-white'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
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
  Resolved: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
}

const pill = (cls: string) =>
  `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`

export default function FeedbackInbox() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const [filter, setFilter] = useState<string>('All')
  const list = useFeedbackInbox(filter === 'All' ? undefined : filter)
  const setStatus = useSetFeedbackStatus()

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
                    <span className="text-xs text-muted">{item.submitter}</span>
                    <span className="text-xs text-muted">· {item.at_human}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-ink">
                    {item.message}
                  </p>
                </div>
                <OverflowMenu
                  size="sm"
                  label="Change status"
                  items={STATUSES.map((s) => ({
                    label: `Mark ${s}`,
                    disabled: item.status === s || setStatus.isPending,
                    onClick: () => setStatus.mutate({ name: item.name, status: s }),
                  }))}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

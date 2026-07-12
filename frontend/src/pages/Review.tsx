import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, SearchX, CheckSquare, Square, Check, X } from 'lucide-react'
import { TabScreen, PullToRefresh } from '@/components/Layout'
import { TodoCard } from '@/components/TodoCard'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { FilterButton, FilterSheet } from '@/components/FilterSheet'
import { NotificationBell } from '@/components/NotificationBell'
import { useDashboard, useBulkProcess } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { buildOptions } from '@/lib/filters'
import { byModifiedDesc } from '@/lib/format'

export default function Review() {
  const { data, isLoading, refetch } = useDashboard()
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [rel, setRel] = useState<'all' | 'owned' | 'led'>('all')
  const [sheet, setSheet] = useState(false)

  const proc = useBulkProcess()
  const busy = proc.busy
  const pct = proc.progress ? (proc.progress.done / proc.progress.total) * 100 : 0
  const toast = useToast()
  const confirm = useConfirm()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  const review = (data?.review ?? []).slice().sort(byModifiedDesc)

  const dimensions = useMemo(
    () => [
      { key: 'project', label: 'Project', options: buildOptions(review, (t) => t.project, (t) => t.project_name) },
      { key: 'brand', label: 'Brand', options: buildOptions(review, (t) => t.brand, (t) => t.brand) },
      {
        key: 'assignee',
        label: 'Assigned to',
        options: buildOptions(review, (t) => t.assigned_to, (t) => t.assigned_to_name),
      },
    ],
    [review],
  )

  const filtered = review.filter(
    (t) =>
      (rel === 'all' || (rel === 'owned' ? t.is_owner : t.is_leader)) &&
      (!filters.project || t.project === filters.project) &&
      (!filters.brand || t.brand === filters.brand) &&
      (!filters.assignee || t.assigned_to === filters.assignee),
  )

  const advCount = ['project', 'brand', 'assignee'].filter((k) => filters[k]).length

  const advanceable = filtered.filter((t) => t.can_advance)
  const advIds = useMemo(() => new Set(advanceable.map((t) => t.name)), [advanceable])

  // Drop selections that left the queue (refetch, filter change).
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => advIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [advIds])

  const allSelected = advanceable.length > 0 && selected.size === advanceable.length
  const toggle = (name: string) =>
    setSelected((p) => {
      const n = new Set(p)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(advanceable.map((t) => t.name)))
  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const runBulk = async () => {
    const ids = [...selected]
    if (!ids.length) return
    const ok = await confirm({
      title: `Approve ${ids.length} task${ids.length > 1 ? 's' : ''}?`,
      message: 'Each advances one step.',
      confirmLabel: 'Approve',
    })
    if (!ok) return
    try {
      const res = await proc.run(ids, 'approve')
      toast('success', res.failed ? `Approved ${res.ok} · ${res.failed} failed` : `Approved ${res.ok}`)
      exitSelect()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const runBulkReject = async () => {
    const ids = [...selected]
    const r = reason.trim()
    if (!ids.length || !r) return
    try {
      const res = await proc.run(ids, 'reject', r)
      toast('success', res.failed ? `Rejected ${res.ok} · ${res.failed} failed` : `Rejected ${res.ok}`)
      setRejectOpen(false)
      setReason('')
      exitSelect()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <TabScreen title="Review" subtitle={`${filtered.length} waiting for your approval`} right={<NotificationBell />}>
      {isLoading && !data ? (
        <FullScreenLoader label="Loading review queue…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {review.length > 0 && (
            <div className="mb-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="inline-flex self-start rounded-xl bg-paper-line dark:bg-slate-800 p-0.5 text-sm font-semibold">
                  <button
                    onClick={() => setRel('all')}
                    className={`rounded-lg px-4 py-1.5 ${rel === 'all' ? 'bg-paper-card dark:bg-slate-700 text-stone-800 dark:text-slate-100 shadow-sm' : 'text-stone-500 dark:text-slate-400'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setRel('owned')}
                    className={`rounded-lg px-4 py-1.5 ${rel === 'owned' ? 'bg-paper-card dark:bg-slate-700 text-stone-800 dark:text-slate-100 shadow-sm' : 'text-stone-500 dark:text-slate-400'}`}
                  >
                    I own
                  </button>
                  <button
                    onClick={() => setRel('led')}
                    className={`rounded-lg px-4 py-1.5 ${rel === 'led' ? 'bg-paper-card dark:bg-slate-700 text-stone-800 dark:text-slate-100 shadow-sm' : 'text-stone-500 dark:text-slate-400'}`}
                  >
                    I led
                  </button>
                </div>
                {selectMode ? (
                  <button
                    onClick={exitSelect}
                    className="ml-auto rounded-lg px-3 py-1.5 text-sm font-semibold text-stone-500 dark:text-slate-400"
                  >
                    Cancel
                  </button>
                ) : advanceable.length > 0 ? (
                  <button
                    onClick={() => setSelectMode(true)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-600 dark:text-brand-300"
                  >
                    <CheckSquare className="h-4 w-4" />
                    Select
                  </button>
                ) : null}
              </div>
              {selectMode ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleAll}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 dark:text-slate-300"
                  >
                    {allSelected ? <CheckSquare className="h-4 w-4 text-brand-600" /> : <Square className="h-4 w-4" />}
                    {allSelected ? 'Clear all' : `Select all (${advanceable.length})`}
                  </button>
                </div>
              ) : (
                <FilterButton count={advCount} onClick={() => setSheet(true)} />
              )}
            </div>
          )}

          {filtered.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {filtered.map((t) =>
                selectMode && t.can_advance ? (
                  <label key={t.name} className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(t.name)}
                      onChange={() => toggle(t.name)}
                      className="h-5 w-5 shrink-0 accent-brand-600"
                    />
                    <div className="pointer-events-none min-w-0 flex-1">
                      <TodoCard todo={t} showAssignee />
                    </div>
                  </label>
                ) : selectMode ? (
                  <div key={t.name} className="opacity-50">
                    <TodoCard todo={t} showAssignee />
                  </div>
                ) : (
                  <TodoCard key={t.name} todo={t} showAssignee />
                ),
              )}
            </div>
          ) : review.length > 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nothing matches these filters"
              subtitle="Clear a filter to see the rest of your queue."
            />
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="Nothing to review"
              subtitle="When a team member marks work Done, it shows up here for your check."
            />
          )}
        </PullToRefresh>
      )}

      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        dimensions={dimensions}
        value={filters}
        onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        onClear={() => setFilters({})}
      />

      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+4.75rem)] pt-3 bg-gradient-to-t from-paper via-paper/95 to-transparent dark:from-slate-950 dark:via-slate-950/95">
          <div className="mx-auto max-w-lg rounded-2xl border border-paper-edge bg-paper-card p-2 shadow-card dark:border-slate-700 dark:bg-slate-800">
            {busy && proc.progress ? (
              <div className="px-1 py-1.5">
                <div className="flex items-center justify-between text-sm font-semibold text-stone-600 dark:text-slate-300">
                  <span>Processing…</span>
                  <span>{proc.progress.done} / {proc.progress.total}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-[width] duration-200"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="pl-2 text-sm font-semibold text-stone-600 dark:text-slate-300">{selected.size} selected</span>
                <button
                  onClick={() => setRejectOpen(true)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-500/40 px-3 py-2 text-sm font-semibold text-rose-600 dark:text-rose-400 active:bg-rose-50 dark:active:bg-rose-500/10"
                >
                  <X className="h-4 w-4" />
                  Reject
                </button>
                <button
                  onClick={runBulk}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm active:bg-brand-700"
                >
                  <Check className="h-4 w-4" />
                  Approve
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {rejectOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-slate-900/40 animate-fade-in"
            onClick={() => !busy && setRejectOpen(false)}
          />
          <div className="relative w-full max-w-sm animate-slide-up rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Reject {selected.size} task{selected.size > 1 ? 's' : ''}?
            </h2>
            <p className="mt-2 text-sm leading-snug text-slate-500 dark:text-slate-400">
              Each goes back to the assignee. No points are earned. The same reason applies to all.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              disabled={busy}
              placeholder="Why are these rejected?"
              className="mt-3 w-full resize-none rounded-2xl border border-slate-200 dark:border-slate-600 bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-rose-400 disabled:opacity-60"
            />
            {busy && proc.progress && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Processing…</span>
                  <span>{proc.progress.done} / {proc.progress.total}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-rose-500 transition-[width] duration-200"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => !busy && setRejectOpen(false)}
                disabled={busy}
                className="flex-1 rounded-2xl bg-slate-100 dark:bg-slate-700 py-3 font-semibold text-slate-600 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-600 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={runBulkReject}
                disabled={busy || !reason.trim()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-rose-600 py-3 font-semibold text-white shadow-sm active:bg-rose-700 disabled:opacity-60"
              >
                {busy ? 'Rejecting…' : (<>Reject <X className="h-4 w-4" /></>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </TabScreen>
  )
}

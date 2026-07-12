import { useEffect, useMemo, useRef, useState } from 'react'
import { ShieldCheck, SearchX, CheckSquare, Square, Check, X } from 'lucide-react'
import { TodoCard } from '@/components/TodoCard'
import { EmptyState, Spinner, Segmented } from '@/components/ui'
import { FilterButton, activeFilterCount, type FilterValue } from '@/components/FilterSheet'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useDashboard, useBulkProcess } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { buildOptions } from '@/lib/filters'
import { byModifiedDesc } from '@/lib/format'
import { Popover } from '@web/components/overlays/Popover'
import { Page, PageHeader } from '@web/components/Page'
import { CardList } from '@web/components/Card'
import { Sheet } from '@web/components/Sheet'

const REL_TABS: { value: 'all' | 'owned' | 'led'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'owned', label: 'I own' },
  { value: 'led', label: 'I led' },
]

export default function Review() {
  const dash = useDashboard()
  const [filters, setFilters] = useState<FilterValue>({})
  const [rel, setRel] = useState<'all' | 'owned' | 'led'>('all')
  const filterRef = useRef<HTMLSpanElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  const proc = useBulkProcess()
  const busy = proc.busy
  const pct = proc.progress ? (proc.progress.done / proc.progress.total) * 100 : 0
  const toast = useToast()
  const confirm = useConfirm()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  const all = dash.data?.review ?? []

  const dims = useMemo(
    () => [
      { key: 'project', label: 'Project', options: buildOptions(all, (t) => t.project, (t) => t.project_name) },
      { key: 'brand', label: 'Brand', options: buildOptions(all, (t) => t.brand ?? '', (t) => t.brand ?? '—') },
      {
        key: 'assignee',
        label: 'Assigned to',
        options: buildOptions(all, (t) => t.assigned_to, (t) => t.assigned_to_name),
      },
    ],
    [all],
  )

  const visible = useMemo(
    () =>
      all
        .filter(
          (t) =>
            (rel === 'all' || (rel === 'owned' ? t.is_owner : t.is_leader)) &&
            (!filters.project || t.project === filters.project) &&
            (!filters.brand || (t.brand ?? '') === filters.brand) &&
            (!filters.assignee || t.assigned_to === filters.assignee),
        )
        .slice()
        .sort(byModifiedDesc),
    [all, filters, rel],
  )

  const advanceable = useMemo(() => visible.filter((t) => t.can_advance), [visible])
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

  const closeReject = () => {
    if (busy) return
    setRejectOpen(false)
    setReason('')
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

  if (dash.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <Page>
      <PageHeader title="Review" subtitle={`${visible.length} waiting for your approval`} />

      {all.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Segmented options={REL_TABS} value={rel} onChange={setRel} />
          {selectMode ? (
            <button
              onClick={exitSelect}
              className="ml-auto rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:text-ink"
            >
              Cancel
            </button>
          ) : advanceable.length > 0 ? (
            <button
              onClick={() => setSelectMode(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              <CheckSquare className="w-4 h-4" />
              Select
            </button>
          ) : null}
        </div>
      )}

      {all.length > 0 &&
        (selectMode ? (
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={toggleAll}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
            >
              {allSelected ? <CheckSquare className="w-4 h-4 text-brand-600" /> : <Square className="w-4 h-4" />}
              {allSelected ? 'Clear all' : `Select all (${advanceable.length})`}
            </button>
            {selected.size > 0 &&
              (busy ? (
                <span className="ml-auto text-sm font-semibold text-muted">
                  Processing… {proc.progress?.done} / {proc.progress?.total}
                </span>
              ) : (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setRejectOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-500/40 px-3 py-1.5 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  >
                    <X className="w-4 h-4" /> Reject {selected.size}
                  </button>
                  <button
                    onClick={runBulk}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    <Check className="w-4 h-4" /> Approve {selected.size}
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <div className="relative mb-3 flex items-center">
            <span ref={filterRef}>
              <FilterButton count={activeFilterCount(filters)} onClick={() => setFilterOpen((o) => !o)} />
            </span>
            <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterRef}>
              <div className="space-y-4">
                {dims.map((d) => (
                  <div key={d.key} className="space-y-1">
                    <div className="text-xs font-semibold text-muted">{d.label}</div>
                    <SearchableSelect
                      value={filters[d.key] ?? ''}
                      onChange={(v) => setFilters((f) => ({ ...f, [d.key]: v }))}
                      options={d.options.map((o) => ({
                        value: o.value,
                        label: o.count != null ? `${o.label} (${o.count})` : o.label,
                      }))}
                      allowClear
                      placeholder="Any"
                    />
                  </div>
                ))}
                <button onClick={() => setFilters({})} className="text-sm text-brand-600">
                  Clear all
                </button>
              </div>
            </Popover>
          </div>
        ))}

      {visible.length > 0 ? (
        <CardList>
          {visible.map((t) =>
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
        </CardList>
      ) : all.length > 0 ? (
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

      <Sheet
        open={rejectOpen}
        onClose={closeReject}
        title={`Reject ${selected.size} task${selected.size > 1 ? 's' : ''}?`}
        size="sm"
      >
        <p className="text-sm leading-snug text-muted">
          Each goes back to the assignee. No points are earned. The same reason applies to all.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          disabled={busy}
          placeholder="Why are these rejected?"
          className="mt-3 w-full resize-none rounded-xl border border-line bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-rose-400 disabled:opacity-60"
        />
        {busy && proc.progress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs font-semibold text-muted">
              <span>Processing…</span>
              <span>{proc.progress.done} / {proc.progress.total}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-rose-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={closeReject}
            disabled={busy}
            className="flex-1 rounded-xl border border-line py-2.5 text-sm font-semibold text-muted hover:text-ink disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={runBulkReject}
            disabled={busy || !reason.trim()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? 'Rejecting…' : (<>Reject <X className="h-4 w-4" /></>)}
          </button>
        </div>
      </Sheet>
    </Page>
  )
}

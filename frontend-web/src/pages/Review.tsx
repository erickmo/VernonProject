import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Check, X, CheckSquare, Square } from 'lucide-react'
import { useDashboard, useBulkProcess } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { byModifiedDesc, formatDate } from '@/lib/format'
import { Avatar, EmptyState, Spinner, Segmented } from '@/components/ui'
import { buildOptions } from '@/lib/filters'
import { FilterButton, activeFilterCount, type FilterValue } from '@/components/FilterSheet'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Popover } from '@web/components/overlays/Popover'
import { useAdvance } from '@/components/AdvanceProvider'
import { useReject } from '@/components/RejectProvider'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'

const REL_TABS: { value: 'all' | 'owned' | 'led'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'owned', label: 'I own' },
  { value: 'led', label: 'I led' },
]

export default function Review() {
  const navigate = useNavigate()
  const dash = useDashboard()
  const advanceConfirm = useAdvance()
  const rejectConfirm = useReject()
  const [filters, setFilters] = useState<FilterValue>({})
  const [rel, setRel] = useState<'all' | 'owned' | 'led'>('all')
  const filterRef = useRef<HTMLSpanElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  const all = dash.data?.review ?? []

  const dims = useMemo(
    () => [
      {
        key: 'project',
        label: 'Project',
        options: buildOptions(all, (t) => t.project, (t) => t.project_name),
      },
      {
        key: 'brand',
        label: 'Brand',
        options: buildOptions(all, (t) => t.brand ?? '', (t) => t.brand ?? '—'),
      },
      {
        key: 'assignee',
        label: 'Assignee',
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

  const approve = (t: { name: string; next_status_label: string | null; to_do: string }) =>
    advanceConfirm(t.name, t.next_status_label || 'Approve', t.to_do)

  const reject = (t: { name: string; to_do: string }) => rejectConfirm(t.name, t.to_do)

  const proc = useBulkProcess()
  const toast = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // null = closed; otherwise which bulk action the confirm modal is for.
  const [confirmMode, setConfirmMode] = useState<null | 'approve' | 'reject'>(null)
  const [reason, setReason] = useState('')
  const busy = proc.busy

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

  const closeConfirm = () => {
    if (busy) return
    setConfirmMode(null)
    setReason('')
  }

  const runBulk = async () => {
    const ids = [...selected]
    if (!ids.length) return
    try {
      if (confirmMode === 'reject') {
        const r = reason.trim()
        if (!r) return
        const res = await proc.run(ids, 'reject', r)
        toast('success', res.failed ? `Rejected ${res.ok} · ${res.failed} failed` : `Rejected ${res.ok}`)
      } else {
        const res = await proc.run(ids, 'approve')
        toast('success', res.failed ? `Approved ${res.ok} · ${res.failed} failed` : `Approved ${res.ok}`)
      }
      setSelected(new Set())
      setConfirmMode(null)
      setReason('')
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
      <PageHeader title="Review" />

      <BentoGrid>
        <BentoTile
          span="sm"
          tone="tint"
          accent="brand"
          actions={
            <div className="relative">
              <span ref={filterRef}>
                <FilterButton
                  count={activeFilterCount(filters)}
                  onClick={() => setFilterOpen((o) => !o)}
                />
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
                  <button
                    onClick={() => setFilters({})}
                    className="text-sm text-brand-600"
                  >
                    Clear all
                  </button>
                </div>
              </Popover>
            </div>
          }
        >
          <BentoStat value={all.length} label="pending" />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {all.length > 0 && (
            <div className="mb-4">
              <Segmented options={REL_TABS} value={rel} onChange={setRel} />
            </div>
          )}
          {advanceable.length > 0 && (
            <div className="sticky top-14 lg:top-4 z-20 -mx-4 mb-3 flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
              <button
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
              >
                {allSelected ? <CheckSquare className="w-4 h-4 text-brand-600" /> : <Square className="w-4 h-4" />}
                {allSelected ? 'Clear all' : `Select all (${advanceable.length})`}
              </button>
              {selected.size > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setConfirmMode('reject')}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-500/40 px-3 py-1.5 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" /> Reject {selected.size}
                  </button>
                  <button
                    onClick={() => setConfirmMode('approve')}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" /> Approve {selected.size}
                  </button>
                </div>
              )}
            </div>
          )}
          {visible.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing to review"
              subtitle="The queue is empty."
            />
          ) : (
            // ponytail: flat list, latest-modified first; project shown per-row (no grouping)
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {visible.map((t) => (
                    <tr
                      key={t.name}
                      className="border-b border-line/70 last:border-0 hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04] cursor-pointer"
                      onClick={() => navigate(`/project-item/${encodeURIComponent(t.name)}`)}
                    >
                      <td className="px-2 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                        {t.can_advance && (
                          <button
                            onClick={() => toggle(t.name)}
                            aria-label="Select task"
                            className="flex items-center text-muted"
                          >
                            {selected.has(t.name) ? (
                              <CheckSquare className="w-5 h-5 text-brand-600" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink">{t.to_do}</div>
                        <div className="text-xs text-muted truncate">{t.project_name}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar
                            name={t.assigned_to_name}
                            image={t.assigned_to_image ?? undefined}
                            config={t.assigned_to_avatar_config}
                            size={24}
                          />
                          <span className="whitespace-nowrap text-muted">{t.assigned_to_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted">
                        {formatDate(t.deadline ?? null)}
                      </td>
                      <td
                        className="px-3 py-2 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {t.can_reject && (
                            <button
                              onClick={() => reject(t)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                            >
                              <X className="w-3 h-3" />
                              Reject
                            </button>
                          )}
                          {t.can_advance && (
                            <button
                              onClick={() => approve(t)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
                            >
                              <Check className="w-3 h-3" />
                              {t.next_status_label || 'Approve'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BentoTile>
      </BentoGrid>

      {confirmMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeConfirm}
        >
          <div className="w-full max-w-sm rounded-xl bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium text-ink">
              {confirmMode === 'reject' ? 'Reject' : 'Approve'} {selected.size} task{selected.size > 1 ? 's' : ''}?
            </p>
            <p className="mt-1 text-sm text-muted">
              {confirmMode === 'reject'
                ? 'Each goes back to the assignee. No points are earned.'
                : 'Each advances one step.'}
            </p>
            {confirmMode === 'reject' && (
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Why are these rejected? (applies to all)"
                className="mt-3 w-full resize-none rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-rose-400"
              />
            )}
            {busy && proc.progress && (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${
                      confirmMode === 'reject' ? 'bg-rose-500' : 'bg-brand-600'
                    }`}
                    style={{ width: `${(proc.progress.done / proc.progress.total) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {proc.progress.done} / {proc.progress.total}
                </p>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeConfirm}
                disabled={busy}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={runBulk}
                disabled={busy || (confirmMode === 'reject' && !reason.trim())}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${
                  confirmMode === 'reject' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-600 hover:bg-brand-700'
                }`}
              >
                {busy
                  ? confirmMode === 'reject'
                    ? 'Rejecting…'
                    : 'Approving…'
                  : `${confirmMode === 'reject' ? 'Reject' : 'Approve'} ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}

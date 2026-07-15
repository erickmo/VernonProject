import { useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { ChevronDown, ChevronUp, Inbox } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { useAdvance } from '@/components/AdvanceProvider'
import { useReject } from '@/components/RejectProvider'
import { useUpdateTodo, useFormOptions } from '@/hooks/useData'
import { STATUS } from '@/lib/status'
import { SearchableSelect } from '@/components/SearchableSelect'
import { DatePicker } from '@web/components/DatePicker'
import type { ProjectItem } from '@/lib/types'

export type Column<T> = {
  key: string
  header: ReactNode
  width?: string                 // e.g. 'w-40'
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
}

export function DataTable<T>({
  rows, columns, getKey, empty, onRowClick, activeKey,
}: {
  rows: T[]
  columns: Column<T>[]
  getKey: (row: T) => string
  empty?: ReactNode
  onRowClick?: (row: T) => void
  activeKey?: string
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a), bv = col.sortValue!(b)
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0
    })
  }, [rows, sort, columns])

  if (rows.length === 0) {
    // ponytail: icon required by EmptyState; Inbox is a sensible "nothing here" default
    return <div className="py-10">{empty ?? <EmptyState icon={Inbox} title="Nothing here yet" />}</div>
  }

  const toggleSort = (c: Column<T>) => {
    if (!c.sortValue) return
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))
  }

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-canvas">
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={c.sortValue ? (sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none') : undefined}
                className={clsx('px-3 py-2.5 font-medium', c.width, c.align === 'right' && 'text-right')}
              >
                {c.sortValue ? (
                  <button type="button" onClick={() => toggleSort(c)}
                    className={clsx('inline-flex items-center gap-1 select-none outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset', c.align === 'right' && 'flex-row-reverse')}>
                    {c.header}
                    {sort?.key === c.key && (sort.dir === 1 ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />)}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1">{c.header}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const k = getKey(row)
            return (
              <tr
                key={k}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  'border-b border-line last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04] hover:shadow-[inset_2px_0_0_#6366f1]',
                  activeKey === k && 'bg-brand-50 dark:bg-brand-500/10',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={clsx('px-3 py-2 align-middle', c.align === 'right' && 'text-right')}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </div>
  )
}

// ── Inline cell renderers ─────────────────────────────────────────────────────

export function StatusCell({ todo }: { todo: ProjectItem }) {
  const advance = useAdvance()
  const reject = useReject()
  const meta = STATUS[todo.status_key]
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`rounded px-1.5 py-0.5 text-xs ${meta.pill}`}>{meta.emoji} {meta.label}</span>
      {todo.can_reject && (
        <button
          onClick={(e) => { e.stopPropagation(); reject(todo.name, todo.to_do) }}
          className="rounded border border-rose-200 dark:border-rose-500/40 px-1.5 py-0.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
        >
          Reject
        </button>
      )}
      {todo.can_advance && todo.next_status_label && (
        <button
          onClick={(e) => { e.stopPropagation(); advance(todo.name, todo.next_status_label!, todo.to_do) }}
          className="rounded border border-line px-1.5 py-0.5 text-xs text-muted hover:bg-hover/[0.04]"
        >
          {todo.next_status_label}
        </button>
      )}
    </span>
  )
}

export function EditableAssigneeCell({ todo }: { todo: ProjectItem }) {
  const update = useUpdateTodo(todo.name)
  const { data: opts } = useFormOptions()
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <SearchableSelect
        value={todo.assigned_to ?? ''}
        options={opts?.users ?? []}
        onChange={(v) => update.mutate({ assigned_to: v })}
        placeholder={todo.assigned_to_name || 'Unassigned'}
      />
    </span>
  )
}

export function EditableDateCell({ todo, field = 'deadline' }: { todo: ProjectItem; field?: 'deadline' | 'start_date' }) {
  const update = useUpdateTodo(todo.name)
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <DatePicker
        value={(todo[field] as string | null) ?? ''}
        onChange={(v) => update.mutate({ [field]: v })}
        className="rounded border border-line bg-transparent px-1.5 py-0.5 text-sm"
      />
    </span>
  )
}

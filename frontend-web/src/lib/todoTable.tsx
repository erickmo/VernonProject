import {
  StatusCell,
  EditableAssigneeCell,
  EditableDateCell,
  type Column,
} from '@web/components/DataTable'
import type { ProjectItem } from '@/lib/types'

// ponytail: shared by the standalone ProjectDetail page and the embedded
// workspace todos pane — stable const, defined once.
export const TODO_COLUMNS: Column<ProjectItem>[] = [
  {
    key: 'task',
    header: 'Task',
    sortValue: (r) => r.to_do,
    render: (r) => (
      <span
        className={
          r.status_key === 'cancelled'
            ? 'text-muted line-through'
            : r.is_overdue
            ? 'font-medium text-rose-700 dark:text-rose-400'
            : 'font-medium text-ink'
        }
      >
        {r.to_do}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: 'w-44',
    render: (r) => <StatusCell todo={r} />,
  },
  {
    key: 'assignee',
    header: 'Assignee',
    width: 'w-36',
    render: (r) => <EditableAssigneeCell todo={r} />,
  },
  {
    key: 'deadline',
    header: 'Deadline',
    width: 'w-36',
    sortValue: (r) => r.deadline ?? '',
    render: (r) => <EditableDateCell todo={r} field="deadline" />,
  },
]

/** Split a detail's todos into Open / Completed / (Cancelled) groups. */
export function todoGroupsOf(items: ProjectItem[], showCancelled: boolean) {
  const visibleItems = showCancelled ? items : items.filter((t) => t.status_key !== 'cancelled')
  const todoGroups = [
    {
      label: 'Open',
      rows: visibleItems.filter((t) => t.status_key !== 'completed' && t.status_key !== 'cancelled'),
    },
    { label: 'Completed', rows: visibleItems.filter((t) => t.status_key === 'completed') },
    ...(showCancelled
      ? [{ label: 'Cancelled', rows: visibleItems.filter((t) => t.status_key === 'cancelled') }]
      : []),
  ].filter((g) => g.rows.length > 0)
  return { visibleItems, todoGroups }
}

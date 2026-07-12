import { useMemo, useState } from 'react'
import { AlarmClock, Mail, Phone, BellRing } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { useTodosDue, useBuzzTodo } from '@/hooks/useData'
import { formatDate } from '@/lib/format'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable, type Column } from '@web/components/DataTable'

type Row = NonNullable<ReturnType<typeof useTodosDue>['data']>['rows'][number]

const inputCls = 'rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink'

/** Local YYYY-MM-DD, `days` from today. Default cutoff = the coming week. */
function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}

export default function TodosDue() {
  const [dueBy, setDueBy] = useState(() => todayPlus(7))
  const [project, setProject] = useState('') // '' = all projects
  const { data, isFetching, error } = useTodosDue(dueBy, !!dueBy)
  const toast = useToast()
  const buzz = useBuzzTodo()

  const allRows = data?.rows ?? []
  // Distinct projects present in the current result, for the filter dropdown.
  const projects = useMemo(
    () => Array.from(new Map(allRows.map((r) => [r.project, r.project_name])).entries()),
    [allRows],
  )
  // Clamp: if the selected project vanished from the new result (date change / refetch),
  // fall back to all rows so the counts + empty state stay honest.
  const rows =
    project && allRows.some((r) => r.project === project)
      ? allRows.filter((r) => r.project === project)
      : allRows
  const overdue = rows.reduce((n, r) => n + (r.overdue ? 1 : 0), 0)

  function onBuzz(todo: string, name: string) {
    buzz.mutate(todo, {
      onSuccess: () => toast('success', `Buzzed ${name}`),
      onError: (e) => toast('error', (e as Error).message || 'Buzz failed'),
    })
  }

  const columns: Column<Row>[] = [
    {
      key: 'to_do',
      header: 'Todo',
      render: (r) => <span className="font-medium text-ink">{r.to_do}</span>,
      sortValue: (r) => r.to_do.toLowerCase(),
    },
    {
      key: 'project',
      header: 'Project',
      render: (r) => <span className="text-muted">{r.project_name}</span>,
      sortValue: (r) => r.project_name.toLowerCase(),
    },
    { key: 'my_role', header: 'You', render: (r) => <span className="text-muted">{r.my_role || '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <span className="text-muted">{r.status}</span> },
    {
      key: 'assignee',
      header: 'Assignee',
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-ink">{r.assignee_name}</span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {r.assignee_email && (
              <a href={`mailto:${r.assignee_email}`} className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-300">
                <Mail className="h-3.5 w-3.5" /> {r.assignee_email}
              </a>
            )}
            {r.assignee_mobile && (
              <a href={`tel:${r.assignee_mobile}`} className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-300">
                <Phone className="h-3.5 w-3.5" /> {r.assignee_mobile}
              </a>
            )}
          </span>
        </div>
      ),
      sortValue: (r) => r.assignee_name.toLowerCase(),
    },
    {
      key: 'deadline',
      header: 'Deadline',
      render: (r) => (
        <span className={`font-semibold ${r.overdue ? 'text-rose-600' : 'text-muted'}`}>
          {r.deadline ? formatDate(r.deadline) : '—'}
          {r.overdue ? ' · overdue' : ''}
        </span>
      ),
      sortValue: (r) => r.deadline ?? '',
    },
    {
      key: 'buzz',
      header: '',
      align: 'right',
      render: (r) => {
        const buzzing = buzz.isPending && buzz.variables === r.todo
        return (
          <button
            onClick={() => onBuzz(r.todo, r.assignee_name)}
            disabled={buzzing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-600 bg-brand-50 px-2.5 py-1 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50 dark:bg-brand-500/15 dark:text-brand-300"
          >
            {buzzing ? <Spinner className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
            Buzz
          </button>
        )
      },
    },
  ]

  return (
    <Page>
      <PageHeader
        icon={AlarmClock}
        title="Todos Due"
        subtitle="Open todos in projects you own, lead, or admin with a deadline on or before this date (overdue included), soonest first. Click Buzz to nudge the assignee."
      />

      <BentoGrid>
        <BentoTile span="full" tone="plain">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Due by
              <input type="date" className={inputCls} value={dueBy} onChange={(e) => setDueBy(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Project
              <SearchableSelect
                value={project}
                onChange={setProject}
                options={projects.map(([id, name]) => ({ value: id, label: name }))}
                placeholder="All projects"
                allowClear
              />
            </label>
            {isFetching && <Spinner className="h-4 w-4 text-brand-500" />}
          </div>
        </BentoTile>

        {data && (
          <>
            <BentoTile span="sm" tone="tint" accent="brand"><BentoStat value={rows.length} label="Todos Due" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="rose"><BentoStat value={overdue} label="Overdue" /></BentoTile>
          </>
        )}

        <BentoTile span="full" tone="plain">
          {isFetching && !data ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : error ? (
            <EmptyState icon={AlarmClock} title="Couldn't load todos" subtitle={(error as Error).message} />
          ) : (
            <DataTable
              rows={rows}
              columns={columns}
              getKey={(r) => r.todo}
              empty={
                <EmptyState
                  icon={AlarmClock}
                  title="Nothing due."
                  subtitle="No open todos to chase — or you don't own, lead, or admin any project."
                />
              }
            />
          )}
        </BentoTile>
      </BentoGrid>
    </Page>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import clsx from 'clsx'
import { AlertCircle, ArrowLeft, Filter, Inbox, Info } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, Spinner } from '@/components/ui'
import { useBoot, useReport, useReportOptions } from '@/hooks/useData'
import type { Opt } from '@/hooks/useData'
import { reportByName, DATE_PRESETS } from '@/lib/reports'
import type { StatusSet } from '@/lib/reports'
import { formatDate, stripHtml } from '@/lib/format'
import { Popover } from '@web/components/overlays/Popover'

function cell(value: unknown, fieldtype: string): string {
  if (value === null || value === undefined) return '—'
  const s = String(value)
  if (s === '') return '' // keep pivot grids clean
  if (/date/i.test(fieldtype)) return formatDate(s.slice(0, 10))
  if (s.includes('<')) return stripHtml(s)
  return s
}

export default function ReportPage() {
  const { name = '' } = useParams()
  const reportName = decodeURIComponent(name)
  const def = reportByName(reportName)
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const { data: options } = useReportOptions()
  const [filters, setFilters] = useState<Record<string, unknown>>({})
  const [preset, setPreset] = useState<string>('')
  const initd = useRef('')

  const filterRef = useRef<HTMLSpanElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  const statusSets: Record<StatusSet, Opt[]> = useMemo(
    () => ({
      todo: options?.todo_statuses ?? [],
      pd: options?.pd_statuses ?? [],
      perf: options?.perf_statuses ?? [],
    }),
    [options],
  )

  // Apply sensible defaults once (current user, status, default period) so each
  // report returns data immediately rather than an empty grid.
  useEffect(() => {
    if (!def || !options || !boot) return
    if (initd.current === reportName) return
    initd.current = reportName
    const init: Record<string, unknown> = {}
    let presetInit = ''
    for (const c of def.controls) {
      if (c.type === 'person' && c.defaultUser) init[c.key] = boot.user
      if (c.type === 'status') {
        const opt = (statusSets[c.statusSet!] || [])[c.defaultIndex ?? 0]
        if (opt) init[c.key] = c.multi ? [opt.value] : opt.value
      }
      if (c.type === 'daterange' && c.defaultPreset) {
        const p = DATE_PRESETS.find((dp) => dp.value === c.defaultPreset)
        if (p) {
          init[c.key] = p.range()
          presetInit = p.value
        }
      }
    }
    setFilters(init)
    setPreset(presetInit)
  }, [def, options, boot, reportName, statusSets])

  const required = def?.controls.filter((c) => c.required) ?? []
  const ready = required.every((c) => {
    const v = filters[c.key]
    return c.type === 'daterange' ? Array.isArray(v) && v.length === 2 : !!v
  })

  const { data, isFetching, error } = useReport(reportName, filters, !!def && ready)

  const setVal = (key: string, value: unknown) =>
    setFilters((f) => {
      const next = { ...f }
      if (value === '' || value == null) delete next[key]
      else next[key] = value
      return next
    })

  const missingLabel = useMemo(
    () =>
      required
        .filter((c) => !(c.type === 'daterange' ? Array.isArray(filters[c.key]) : filters[c.key]))
        .map((c) => c.label),
    [required, filters],
  )

  // Count of "active" (non-default-ish) filters for the filter button badge.
  const activeCount = useMemo(() => {
    if (!def) return 0
    return def.controls.reduce((n, c) => {
      const v = filters[c.key]
      if (v == null || v === '') return n
      if (Array.isArray(v) && v.length === 0) return n
      return n + 1
    }, 0)
  }, [def, filters])

  if (!def) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Report</h1>
        <EmptyState icon={AlertCircle} title="Unknown report" subtitle="This report doesn't exist." />
      </div>
    )
  }

  const projects = options?.projects ?? []
  const users = options?.users ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/reports"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Back to reports"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold">{def.title}</h1>
          {isFetching && data ? <Spinner className="h-4 w-4 text-brand-500" /> : null}
        </div>
        <div className="relative">
          <span ref={filterRef}>
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
                  {activeCount}
                </span>
              )}
            </button>
          </span>
          <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterRef}>
            <div className="space-y-4">
              {def.controls.map((c) => {
                const label = (
                  <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {c.label}
                    {c.required && <span className="text-rose-500"> *</span>}
                  </label>
                )

                if (c.type === 'project' || c.type === 'person') {
                  const opts = c.type === 'project' ? projects : users
                  const anyLabel =
                    c.type === 'project'
                      ? c.required
                        ? 'Select a project…'
                        : 'All projects'
                      : c.required
                        ? 'Select a person…'
                        : 'Everyone'
                  return (
                    <div key={c.key}>
                      {label}
                      <SearchableSelect
                        value={(filters[c.key] as string) || ''}
                        onChange={(v) => setVal(c.key, v)}
                        options={opts.map((o) => ({ value: o.value, label: o.label }))}
                        allowClear
                        placeholder={anyLabel}
                      />
                    </div>
                  )
                }

                if (c.type === 'status') {
                  const set = statusSets[c.statusSet!] || []
                  if (c.multi) {
                    const sel = (filters[c.key] as string[]) || []
                    return (
                      <div key={c.key}>
                        {label}
                        <div className="flex flex-wrap gap-2">
                          {set.map((o) => {
                            const on = sel.includes(o.value)
                            return (
                              <button
                                key={o.value}
                                onClick={() => {
                                  const next = on
                                    ? sel.filter((v) => v !== o.value)
                                    : [...sel, o.value]
                                  setVal(c.key, next.length ? next : '')
                                }}
                                className={clsx(
                                  'rounded-lg border px-2.5 py-1 text-xs font-medium transition',
                                  on
                                    ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50',
                                )}
                              >
                                {o.label}
                              </button>
                            )
                          })}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                          {sel.length ? `${sel.length} selected` : 'All statuses'}
                        </p>
                      </div>
                    )
                  }
                  return (
                    <div key={c.key}>
                      {label}
                      <SearchableSelect
                        value={(filters[c.key] as string) || ''}
                        onChange={(v) => setVal(c.key, v)}
                        options={set.map((o) => ({ value: o.value, label: o.label }))}
                        allowClear
                        placeholder="Any"
                      />
                    </div>
                  )
                }

                // daterange
                const presets = DATE_PRESETS.filter((p) => !c.maxDays || p.days <= c.maxDays)
                return (
                  <div key={c.key}>
                    {label}
                    <div className="flex flex-wrap gap-2">
                      {presets.map((p) => {
                        const active = preset === p.value
                        return (
                          <button
                            key={p.value}
                            onClick={() => {
                              setPreset(p.value)
                              setVal(c.key, p.range())
                            }}
                            className={clsx(
                              'rounded-lg border px-2.5 py-1 text-xs font-medium transition',
                              active
                                ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50',
                            )}
                          >
                            {p.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Popover>
        </div>
      </div>

      {/* Report messages (e.g. validation hints from the report itself) */}
      {data?.messages?.length ? (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 dark:bg-amber-500/15 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            {data.messages.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </div>
        </div>
      ) : null}

      {/* Results */}
      {!ready ? (
        <EmptyState
          icon={Filter}
          title="Set the filters first"
          subtitle={`Choose ${missingLabel.join(' & ')} to run this report.`}
        />
      ) : isFetching && !data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn't run report"
          subtitle={(error as Error).message}
        />
      ) : !data || !data.rows.length ? (
        <EmptyState icon={Inbox} title="No results" subtitle="No data for these filters." />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {data.total} {data.total === 1 ? 'row' : 'rows'}
            </p>
            {data.rows.some((r) => r.todo_id) ? (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Click a row to open the task
              </span>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                  {data.columns.map((col, i) => (
                    <th
                      key={col.fieldname + i}
                      className={clsx(
                        'whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400',
                        i === 0 && 'sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/60',
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.rows.map((row, ri) => {
                  const todoId = row.todo_id as string | undefined
                  return (
                    <tr
                      key={ri}
                      onClick={
                        todoId
                          ? () => navigate(`/project-item/${encodeURIComponent(todoId)}`)
                          : undefined
                      }
                      className={clsx(
                        todoId && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50',
                      )}
                    >
                      {data.columns.map((col, ci) => (
                        <td
                          key={col.fieldname + ci}
                          className={clsx(
                            'whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-200',
                            ci === 0 &&
                              'sticky left-0 z-10 max-w-[260px] truncate bg-white dark:bg-slate-900 font-medium',
                            ci === 0 && todoId && 'text-brand-700 dark:text-brand-300',
                          )}
                        >
                          {cell(row[col.fieldname], col.fieldtype)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {data.total > data.rows.length && (
            <p className="px-1 text-center text-xs text-slate-400 dark:text-slate-500">
              Showing first {data.rows.length} of {data.total}. Refine filters to narrow results.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

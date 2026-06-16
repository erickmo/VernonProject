import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { AlertCircle, Filter, Inbox, Info } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, FullScreenLoader, Spinner } from '@/components/ui'
import { useBoot, useReport, useReportOptions } from '@/hooks/useData'
import type { Opt } from '@/hooks/useData'
import { reportByName, DATE_PRESETS } from '@/lib/reports'
import type { StatusSet } from '@/lib/reports'
import { formatDate, stripHtml } from '@/lib/format'

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

  if (!def) {
    return (
      <DetailScreen title="Report">
        <EmptyState icon={AlertCircle} title="Unknown report" />
      </DetailScreen>
    )
  }

  const projects = options?.projects ?? []
  const users = options?.users ?? []

  return (
    <DetailScreen title={def.title}>
      {/* Filters */}
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Filter className="h-3.5 w-3.5" /> Filters
        </p>
        <div className="space-y-3">
          {def.controls.map((c) => {
            const label = (
              <label className="mb-1 block text-xs font-medium text-slate-500">
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
                              const next = on ? sel.filter((v) => v !== o.value) : [...sel, o.value]
                              setVal(c.key, next.length ? next : '')
                            }}
                            className={clsx(
                              'rounded-xl border px-3 py-1.5 text-sm font-medium transition active:scale-95',
                              on
                                ? 'border-brand-600 bg-brand-50 text-brand-700'
                                : 'border-slate-200 bg-white text-slate-500',
                            )}
                          >
                            {o.label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
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
                          'rounded-xl border px-3 py-1.5 text-sm font-medium transition active:scale-95',
                          active
                            ? 'border-brand-600 bg-brand-50 text-brand-700'
                            : 'border-slate-200 bg-white text-slate-600',
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
      </div>

      {/* Report messages (e.g. validation hints from the report itself) */}
      {data?.messages?.length ? (
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            {data.messages.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </div>
        </div>
      ) : null}

      {/* Results */}
      <div className="mt-4">
        {!ready ? (
          <EmptyState
            icon={Filter}
            title="Set the filters above"
            subtitle={`Choose ${missingLabel.join(' & ')} to run this report.`}
          />
        ) : isFetching && !data ? (
          <FullScreenLoader label="Running report…" />
        ) : error ? (
          <EmptyState icon={AlertCircle} title="Couldn't run report" subtitle={(error as Error).message} />
        ) : !data || !data.rows.length ? (
          <EmptyState icon={Inbox} title="No results" subtitle="No data for these filters." />
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-slate-600">
                {data.total} {data.total === 1 ? 'row' : 'rows'}
              </p>
              {isFetching ? (
                <Spinner className="h-4 w-4 text-brand-500" />
              ) : data.rows.some((r) => r.todo_id) ? (
                <span className="text-xs text-slate-400">Tap a row to open the task</span>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-card">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {data.columns.map((col, i) => (
                      <th
                        key={col.fieldname + i}
                        className={clsx(
                          'whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500',
                          i === 0 && 'sticky left-0 z-10 bg-slate-50',
                        )}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, ri) => {
                    const todoId = row.todo_id as string | undefined
                    return (
                      <tr
                        key={ri}
                        onClick={todoId ? () => navigate(`/todo/${encodeURIComponent(todoId)}`) : undefined}
                        className={clsx(
                          'border-b border-slate-50 last:border-0',
                          todoId && 'cursor-pointer transition active:bg-brand-50',
                        )}
                      >
                        {data.columns.map((col, ci) => (
                          <td
                            key={col.fieldname + ci}
                            className={clsx(
                              'whitespace-nowrap px-3 py-2.5 text-slate-700',
                              ci === 0 &&
                                'sticky left-0 z-10 max-w-[180px] truncate bg-white font-medium',
                              ci === 0 && todoId && 'text-brand-700',
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
              <p className="mt-2 px-1 text-center text-xs text-slate-400">
                Showing first {data.rows.length} of {data.total}. Refine filters to narrow results.
              </p>
            )}
          </>
        )}
      </div>
    </DetailScreen>
  )
}

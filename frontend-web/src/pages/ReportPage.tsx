import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import clsx from 'clsx'
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  Inbox,
  Info,
  X,
} from 'lucide-react'
import { buildCsv, downloadCsv } from '@web/lib/reportCsv'
import { numAlign, formatReportNumber, columnTotals } from '@web/lib/reportFormat'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, Spinner } from '@/components/ui'
import { useBoot, useReport, useReportOptions } from '@/hooks/useData'
import type { Opt } from '@/hooks/useData'
import { useReportRowMenu } from '@/hooks/useReportRowMenu'
import { reportByName, DATE_PRESETS } from '@/lib/reports'
import type { StatusSet } from '@/lib/reports'
import { formatDate, stripHtml } from '@/lib/format'
import { Popover } from '@web/components/overlays/Popover'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

function cell(value: unknown, fieldtype: string): string {
  if (value === null || value === undefined) return '—'
  const s = String(value)
  if (s === '') return '' // keep pivot grids clean
  if (/date/i.test(fieldtype)) return formatDate(s.slice(0, 10))
  if (numAlign(fieldtype) && s.trim() !== '') {
    const n = Number(value)
    if (!Number.isNaN(n)) return formatReportNumber(n, fieldtype)
  }
  if (s.includes('<')) return stripHtml(s)
  return s
}

const PAGE_SIZE = 50
type SortDir = 'asc' | 'desc'

// Treat numeric Frappe fieldtypes as numeric for sorting.
function isNumericType(fieldtype: string): boolean {
  return /int|float|currency|percent|rating|duration/i.test(fieldtype)
}

// Null / undefined / '' always sort last (regardless of direction).
function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

export default function ReportPage() {
  const { name = '' } = useParams()
  const reportName = safeDecode(name)
  const def = reportByName(reportName)
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const { data: options } = useReportOptions()
  const [filters, setFilters] = useState<Record<string, unknown>>({})
  const [preset, setPreset] = useState<string>('')
  const initd = useRef('')

  const filterRef = useRef<HTMLSpanElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  // Client-side sorting + progressive "load more" reveal.
  const [sort, setSort] = useState<{ field: string; dir: SortDir } | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)

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
  const openRowMenu = useReportRowMenu()

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

  // Sort the FULL fetched result set (not just the revealed page), then slice
  // to the visible count below. Numeric columns sort numerically; everything
  // else falls back to a locale-aware string compare. Empty values sort last.
  const sortedRows = useMemo(() => {
    const rows = data?.rows ?? []
    if (!sort) return rows
    const col = data?.columns.find((c) => c.fieldname === sort.field)
    if (!col) return rows
    const numeric = isNumericType(col.fieldtype)
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = a[sort.field]
      const vb = b[sort.field]
      const ea = isEmpty(va)
      const eb = isEmpty(vb)
      if (ea && eb) return 0
      if (ea) return 1 // empties always last
      if (eb) return -1
      let cmp: number
      if (numeric) {
        cmp = Number(va) - Number(vb)
        if (Number.isNaN(cmp)) cmp = String(va).localeCompare(String(vb))
      } else {
        const na = Number(va)
        const nb = Number(vb)
        cmp =
          !Number.isNaN(na) && !Number.isNaN(nb) && String(va).trim() !== '' && String(vb).trim() !== ''
            ? na - nb
            : String(va).localeCompare(String(vb), undefined, { numeric: true })
      }
      return cmp * factor
    })
  }, [data?.rows, data?.columns, sort])

  const visibleRows = sortedRows.slice(0, visible)

  // Export the FULL sorted result set (not just the revealed page) as CSV,
  // formatting cells the same way the grid renders them.
  const onExport = () => {
    if (!data || !data.rows.length) return
    const csv = buildCsv(data.columns, sortedRows, (v, ft) => {
      if (v == null) return ''
      const s = String(v)
      if (s === '') return ''
      if (/date/i.test(ft)) return formatDate(s.slice(0, 10))
      if (s.includes('<')) return stripHtml(s)
      return s
    })
    downloadCsv(def?.title ?? 'report', csv)
  }

  // Column totals for money/count columns, across the full result set.
  const totals = useMemo(() => (data ? columnTotals(data.columns, data.rows) : {}), [data])
  const hasTotals = Object.keys(totals).length > 0

  // Toggle sort for a column: asc → desc → none.
  const toggleSort = (field: string) =>
    setSort((cur) => {
      if (!cur || cur.field !== field) return { field, dir: 'asc' }
      if (cur.dir === 'asc') return { field, dir: 'desc' }
      return null
    })

  // Reset paging + sorting whenever the underlying result set changes
  // (new report or new filters produce a fresh rows array).
  useEffect(() => {
    setVisible(PAGE_SIZE)
    setSort(null)
  }, [data?.rows])

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

  // Human-readable chips for each active filter, each removable in one click —
  // surfaces what's filtering the report without opening the popover.
  const filterChips: { key: string; text: string; onRemove: () => void }[] = def.controls.flatMap((c) => {
    const v = filters[c.key]
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return []
    if (c.type === 'daterange') {
      const p = DATE_PRESETS.find((dp) => dp.value === preset)
      const text = p ? p.label : Array.isArray(v) ? `${(v as string[])[0]} → ${(v as string[])[1]}` : ''
      return [{ key: c.key, text: `${c.label}: ${text}`, onRemove: () => { setVal(c.key, ''); setPreset('') } }]
    }
    if (c.type === 'project' || c.type === 'person') {
      const opt = (c.type === 'project' ? projects : users).find((o) => o.value === v)
      return [{ key: c.key, text: `${c.label}: ${String(opt?.label ?? v)}`, onRemove: () => setVal(c.key, '') }]
    }
    if (c.type === 'status') {
      const set = statusSets[c.statusSet!] || []
      if (c.multi && Array.isArray(v)) {
        const sel = v as string[]
        return sel.map((sv) => ({
          key: `${c.key}:${sv}`,
          text: set.find((o) => o.value === sv)?.label ?? String(sv),
          onRemove: () => {
            const next = sel.filter((x) => x !== sv)
            setVal(c.key, next.length ? next : '')
          },
        }))
      }
      return [{ key: c.key, text: `${c.label}: ${set.find((o) => o.value === v)?.label ?? String(v)}`, onRemove: () => setVal(c.key, '') }]
    }
    return []
  })

  return (
    <div className="space-y-5">
      <BentoGrid>
        {/* Header hero tile */}
        <BentoTile span="wide" tone="gradient" accent="brand">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                to="/reports"
                className="flex h-9 w-9 items-center justify-center rounded-xl opacity-70 transition active:scale-[0.97] hover:opacity-100 hover:bg-hover/[0.04]"
                aria-label="Back to reports"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-2xl font-bold">{def.title}</h1>
              {isFetching && data ? <Spinner className="h-4 w-4 text-brand-500" /> : null}
            </div>
            <div className="flex items-center gap-2">
              {data && data.rows.length > 0 && (
                <button
                  onClick={onExport}
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas/60 px-3 py-2 text-sm font-medium transition active:scale-[0.97] hover:bg-canvas"
                  title="Download as CSV"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                </button>
              )}
              <div className="relative">
              <span ref={filterRef}>
                <button
                  onClick={() => setFilterOpen((o) => !o)}
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas/60 px-3 py-2 text-sm font-medium transition active:scale-[0.97] hover:bg-canvas"
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
                      <label className="mb-1 block text-xs font-semibold text-muted dark:text-slate-400">
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
                                      'rounded-xl border px-2.5 py-1 text-xs font-medium transition active:scale-[0.97]',
                                      on
                                        ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300'
                                        : 'border-line bg-canvas text-muted hover:bg-hover/[0.03]',
                                    )}
                                  >
                                    {o.label}
                                  </button>
                                )
                              })}
                            </div>
                            <p className="mt-1 text-[11px] text-muted dark:text-slate-500">
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
                                  'rounded-xl border px-2.5 py-1 text-xs font-medium transition active:scale-[0.97]',
                                  active
                                    ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300'
                                    : 'border-line bg-canvas text-ink hover:bg-hover/[0.03]',
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
          </div>
        </BentoTile>

        {/* Active-filter chips — removable, so current filters are visible without the popover */}
        {filterChips.length > 0 && (
          <BentoTile span="full" tone="plain">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Filters</span>
              {filterChips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={chip.onRemove}
                  title="Remove filter"
                  className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1 text-xs font-medium text-ink transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"
                >
                  {chip.text}
                  <X className="h-3 w-3 opacity-60 transition group-hover:opacity-100" />
                </button>
              ))}
              <button
                onClick={() => {
                  setFilters({})
                  setPreset('')
                }}
                className="ml-1 text-xs font-semibold text-brand-600 transition hover:text-brand-700"
              >
                Clear all
              </button>
            </div>
          </BentoTile>
        )}

        {/* Summary stat tiles — shown once data is loaded */}
        {data && data.rows.length > 0 && (
          <>
            <BentoTile span="sm" tone="tint" accent="brand">
              <BentoStat value={data.rows.length} label="Rows" delta={data.total > data.rows.length ? `of ${data.total} total` : undefined} />
            </BentoTile>
            <BentoTile span="sm" tone="tint" accent="brand">
              <BentoStat value={data.columns.length} label="Columns" />
            </BentoTile>
          </>
        )}

        {/* Report messages */}
        {data?.messages?.length ? (
          <BentoTile span="full" tone="plain">
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                {data.messages.map((m, i) => (
                  <p key={i}>{m}</p>
                ))}
              </div>
            </div>
          </BentoTile>
        ) : null}

        {/* Results tile */}
        <BentoTile span="full" tone="plain">
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
                <p className="text-sm font-semibold text-ink">
                  Showing {visibleRows.length} of {data.rows.length}
                  {data.total > data.rows.length ? ` (of ${data.total} total)` : ''}
                </p>
                {data.rows.some((r) => r.todo_id) ? (
                  <span className="text-xs text-muted">
                    Click a row to open · right-click for actions
                  </span>
                ) : null}
              </div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface">
                      {data.columns.map((col, i) => {
                        const active = sort?.field === col.fieldname
                        return (
                          <th
                            key={col.fieldname + i}
                            aria-sort={
                              active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                            }
                            className={clsx(
                              'whitespace-nowrap px-0 py-0 text-left text-xs font-semibold uppercase tracking-wide text-muted',
                              i === 0 && 'sticky left-0 z-10 bg-surface',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(col.fieldname)}
                              className={clsx(
                                'flex w-full items-center gap-1 px-4 py-2.5 uppercase tracking-wide outline-none transition-colors',
                                numAlign(col.fieldtype) ? 'justify-end text-right' : 'text-left',
                                'hover:text-ink',
                                'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset',
                                active && 'text-ink',
                              )}
                            >
                              <span className="truncate">{col.label}</span>
                              {active &&
                                (sort!.dir === 'asc' ? (
                                  <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                ))}
                            </button>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {visibleRows.map((row, ri) => {
                      const todoId = row.todo_id as string | undefined
                      return (
                        <tr
                          key={ri}
                          onClick={
                            todoId
                              ? () => navigate(`/project-item/${encodeURIComponent(todoId)}`)
                              : undefined
                          }
                          onContextMenu={
                            todoId && openRowMenu
                              ? (e) => {
                                  e.preventDefault()
                                  openRowMenu(todoId, { x: e.clientX, y: e.clientY })
                                }
                              : undefined
                          }
                          className={clsx(
                            todoId && 'cursor-pointer hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04]',
                          )}
                        >
                          {data.columns.map((col, ci) => (
                            <td
                              key={col.fieldname + ci}
                              className={clsx(
                                'whitespace-nowrap px-4 py-2.5 text-ink',
                                ci === 0 &&
                                  'sticky left-0 z-10 max-w-[260px] truncate bg-surface font-medium',
                                ci === 0 && todoId && 'text-brand-700 dark:text-brand-300',
                                ci !== 0 && numAlign(col.fieldtype) && 'text-right tabular-nums',
                              )}
                            >
                              {cell(row[col.fieldname], col.fieldtype)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                  {hasTotals && (
                    <tfoot>
                      <tr className="border-t-2 border-line bg-surface text-sm font-semibold text-ink">
                        {data.columns.map((col, ci) => (
                          <td
                            key={col.fieldname + 'tot' + ci}
                            className={clsx(
                              'whitespace-nowrap px-4 py-2.5',
                              ci === 0 && 'sticky left-0 z-10 bg-surface',
                              ci !== 0 && numAlign(col.fieldtype) && 'text-right tabular-nums',
                            )}
                          >
                            {ci === 0
                              ? 'Total'
                              : col.fieldname in totals
                                ? cell(totals[col.fieldname], col.fieldtype)
                                : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {visibleRows.length < data.rows.length && (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition active:scale-[0.97] hover:bg-hover/[0.03] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    Load more
                    <span className="text-xs text-muted">
                      ({Math.min(PAGE_SIZE, data.rows.length - visibleRows.length)} more)
                    </span>
                  </button>
                </div>
              )}
              {data.total > data.rows.length && visibleRows.length >= data.rows.length && (
                <p className="px-1 text-center text-xs text-muted">
                  Showing all {data.rows.length} loaded of {data.total} total. Refine filters to narrow
                  results.
                </p>
              )}
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}

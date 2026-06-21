import { useMemo } from 'react'
import { CalendarRange, FileCode, FileSpreadsheet } from 'lucide-react'
import type { GanttGroup } from '@/lib/gantt'
import { STATUS } from '@/lib/status'

// Hex equivalents of the status dot colors, for the standalone HTML export.
const STATUS_HEX: Record<string, string> = {
  planned: '#94a3b8',
  done: '#f59e0b',
  checked: '#0ea5e9',
  completed: '#10b981',
}

const DAY_W = 30 // px per day column
const LABEL_W = 120 // px left (sticky) label column
const ROW_H = 30 // px per bar row

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Whole days since the Unix epoch (UTC midnight) — stable integer keys for layout.
function parseDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}
function dayToDate(n: number): Date {
  return new Date(n * 86400000)
}

interface GanttChartProps {
  groups: GanttGroup[]
  /** Click handler for a bar (e.g. navigate to the task). */
  onBarClick?: (id: string) => void
  /** Base filename for the PNG download (without extension). */
  title?: string
}

export function GanttChart({ groups, onBarClick, title = 'gantt' }: GanttChartProps) {
  const bars = groups.flatMap((g) => g.bars)
  const fileBase = title.replace(/[^\w-]+/g, '_') + '_gantt'

  // Flat tabular rows shared by both exports.
  const exportRows = groups.flatMap((g) =>
    g.bars.map((b) => ({
      Detail: g.title,
      Task: b.label,
      Assignee: b.sub || '',
      Start: b.start,
      End: b.end,
      Status: STATUS[b.statusKey].label,
      Overdue: b.overdue ? 'Yes' : '',
      statusKey: b.statusKey,
    })),
  )

  const downloadBlob = (content: BlobPart, mime: string, ext: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileBase}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Shared date axis for the exported timeline grids.
  const exportDays = (): number[] => {
    if (!exportRows.length) return []
    let mn = Infinity
    let mx = -Infinity
    for (const r of exportRows) {
      mn = Math.min(mn, parseDay(r.Start))
      mx = Math.max(mx, parseDay(r.End))
    }
    const out: number[] = []
    for (let d = mn; d <= mx; d++) out.push(d)
    return out
  }
  const isoFromDay = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10)
  const shortDay = (n: number) => {
    const d = new Date(n * 86400000)
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
  }
  const inSpan = (r: { Start: string; End: string }, day: number) =>
    day >= parseDay(r.Start) && day <= parseDay(r.End)

  const downloadHtml = () => {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
    const dayCols = exportDays()
    const headDates = dayCols
      .map((d) => {
        const dt = new Date(d * 86400000)
        const weekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6
        return `<th class="day${weekend ? ' wknd' : ''}">${shortDay(d)}</th>`
      })
      .join('')
    const rowsHtml = exportRows
      .map((r) => {
        const cells = dayCols
          .map((d) => {
            const dt = new Date(d * 86400000)
            const weekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6
            const on = inSpan(r, d)
            const bg = on ? STATUS_HEX[r.statusKey] : weekend ? '#f8fafc' : ''
            return `<td class="day"${bg ? ` style="background:${bg}"` : ''}></td>`
          })
          .join('')
        return `<tr>
<td>${esc(r.Detail)}</td>
<td>${esc(r.Task)}</td>
<td>${esc(r.Assignee)}</td>
<td><span class="pill" style="background:${STATUS_HEX[r.statusKey]}">${esc(r.Status)}</span></td>
${cells}
</tr>`
      })
      .join('\n')
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — Gantt</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:24px;color:#0f172a}
h1{font-size:18px}
table{border-collapse:collapse;font-size:12px}
th,td{border:1px solid #e2e8f0;padding:4px 8px;text-align:left;white-space:nowrap}
th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#475569}
th.day,td.day{width:22px;min-width:22px;padding:4px 0;text-align:center}
th.wknd{background:#e2e8f0}
.pill{display:inline-block;padding:1px 8px;border-radius:9999px;color:#fff;font-size:11px;font-weight:600}
</style></head><body>
<h1>${esc(title)} — Gantt</h1>
<table><thead><tr>
<th>Detail</th><th>Task</th><th>Assignee</th><th>Status</th>${headDates}
</tr></thead><tbody>
${rowsHtml}
</tbody></table>
</body></html>`
    downloadBlob(doc, 'text/html', 'html')
  }

  const downloadXlsx = async () => {
    const XLSX = await import('xlsx') // code-split: only loaded on demand
    const dayCols = exportDays()
    const header = ['Detail', 'Task', 'Assignee', 'Status', 'Start', 'End', ...dayCols.map(isoFromDay)]
    const aoa: (string | number)[][] = [header]
    for (const r of exportRows) {
      aoa.push([
        r.Detail,
        r.Task,
        r.Assignee,
        r.Status,
        r.Start,
        r.End,
        ...dayCols.map((d) => (inSpan(r, d) ? '█' : '')),
      ])
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [
      { wch: 22 }, { wch: 40 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
      ...dayCols.map(() => ({ wch: 4 })),
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Gantt')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    downloadBlob(out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx')
  }

  const { min, days } = useMemo(() => {
    if (!bars.length) return { min: 0, days: [] as number[] }
    let mn = Infinity
    let mx = -Infinity
    for (const b of bars) {
      mn = Math.min(mn, parseDay(b.start))
      mx = Math.max(mx, parseDay(b.end))
    }
    const out: number[] = []
    for (let d = mn; d <= mx; d++) out.push(d)
    return { min: mn, days: out }
  }, [bars])

  if (!bars.length) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-card">
        <CalendarRange className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-400">No dated tasks to chart yet.</p>
      </div>
    )
  }

  const totalW = days.length * DAY_W
  const today = Math.floor(Date.now() / 86400000)
  const todayOffset = today >= min && today <= min + days.length - 1 ? (today - min) * DAY_W : null

  return (
    <div>
      <div className="mb-2 flex justify-end gap-2">
        <button
          onClick={downloadHtml}
          title="Download HTML"
          aria-label="Download HTML"
          className="rounded-full bg-slate-100 p-2 text-slate-600 active:scale-95"
        >
          <FileCode className="h-4 w-4" />
        </button>
        <button
          onClick={downloadXlsx}
          title="Download Excel"
          aria-label="Download Excel"
          className="rounded-full bg-slate-100 p-2 text-slate-600 active:scale-95"
        >
          <FileSpreadsheet className="h-4 w-4" />
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
        <div className="relative bg-white" style={{ width: LABEL_W + totalW }}>
        {/* Today marker */}
        {todayOffset !== null && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-rose-400/70"
            style={{ left: LABEL_W + todayOffset + DAY_W / 2 }}
          />
        )}

        {/* Header: month + day number */}
        <div className="flex border-b border-slate-100">
          <div className="sticky left-0 z-20 shrink-0 bg-white" style={{ width: LABEL_W }} />
          <div className="relative" style={{ width: totalW, height: 34 }}>
            {days.map((d, i) => {
              const date = dayToDate(d)
              const dom = date.getUTCDate()
              const dow = date.getUTCDay()
              const weekend = dow === 0 || dow === 6
              const firstOfMonth = dom === 1 || i === 0
              return (
                <div
                  key={d}
                  className={
                    'absolute top-0 bottom-0 border-l text-center ' +
                    (weekend ? 'bg-slate-50 ' : '') +
                    (firstOfMonth ? 'border-slate-300' : 'border-slate-100')
                  }
                  style={{ left: i * DAY_W, width: DAY_W }}
                >
                  {firstOfMonth && (
                    <span className="absolute left-0.5 top-0.5 whitespace-nowrap text-[9px] font-bold text-slate-500">
                      {MONTHS[date.getUTCMonth()]}
                    </span>
                  )}
                  <span className="absolute bottom-0.5 left-0 right-0 text-[10px] text-slate-400">{dom}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Groups */}
        {groups.map((g) =>
          g.bars.length ? (
            <div key={g.title}>
              <div
                className="sticky left-0 z-20 bg-slate-50/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500"
                style={{ width: LABEL_W + totalW }}
              >
                {g.title}
              </div>
              {g.bars.map((b) => {
                const s = parseDay(b.start)
                const e = parseDay(b.end)
                const left = (s - min) * DAY_W
                const width = (e - s + 1) * DAY_W
                const meta = STATUS[b.statusKey]
                const clickable = !!onBarClick
                return (
                  <div
                    key={b.id}
                    onClick={clickable ? () => onBarClick!(b.id) : undefined}
                    className={
                      'flex border-t border-slate-50 ' +
                      (clickable ? 'cursor-pointer hover:bg-slate-50 active:bg-slate-100' : '')
                    }
                    style={{ height: ROW_H }}
                  >
                    <div
                      className="sticky left-0 z-10 flex shrink-0 items-center truncate bg-white px-3 text-xs text-slate-700"
                      style={{ width: LABEL_W }}
                      title={b.label}
                    >
                      <span className="truncate">{b.label}</span>
                    </div>
                    <div className="relative" style={{ width: totalW }}>
                      <div
                        className={
                          'absolute top-1 bottom-1 flex items-center overflow-hidden rounded-md px-1.5 text-[10px] font-medium text-white ' +
                          meta.dot +
                          (b.overdue ? ' ring-2 ring-rose-400' : '')
                        }
                        style={{ left, width }}
                        title={`${b.label} · ${b.start} → ${b.end}${b.sub ? ' · ' + b.sub : ''}`}
                      >
                        {width >= 56 && <span className="truncate">{b.sub || meta.label}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null,
        )}
        </div>
      </div>
    </div>
  )
}

// Progress bar chart for the points log. Buckets an (newest-first) log by
// day / week / month into net points and draws them chronologically
// (oldest -> newest), showing the last 50 buckets. Shared by /m and /w
// points-log screens; each wraps it in its own card.
import { useState } from 'react'
import type { PointsLogRow } from '@/lib/types'

const POS = '#10b981' // emerald-500
const NEG = '#f43f5e' // rose-500

type Gran = 'day' | 'week' | 'month'
const PERIODS: { g: Gran; label: string }[] = [
  { g: 'day', label: 'Daily' },
  { g: 'week', label: 'Weekly' },
  { g: 'month', label: 'Monthly' },
]

const pad = (n: number) => String(n).padStart(2, '0')

// Bucket key for a YYYY-MM-DD iso, sortable lexically within a granularity.
function bucketKey(iso: string, g: Gran): string {
  if (g === 'month') return iso.slice(0, 7) // YYYY-MM
  if (g === 'week') {
    const [y, m, d] = iso.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)) // back to Monday
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  }
  return iso.slice(0, 10)
}

function labelOf(key: string, g: Gran): string {
  if (g === 'month') {
    const [y, mo] = key.split('-').map(Number)
    return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  }
  const [, mo, d] = key.split('-').map(Number)
  return `${d}/${mo}`
}

const bucketStart = (d: Date, g: Gran): Date => {
  const x = new Date(d.getFullYear(), d.getMonth(), g === 'month' ? 1 : d.getDate())
  if (g === 'week') x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // back to Monday
  return x
}
const stepBack = (d: Date, g: Gran, n: number): Date =>
  g === 'month'
    ? new Date(d.getFullYear(), d.getMonth() - n, 1)
    : new Date(d.getFullYear(), d.getMonth(), d.getDate() - n * (g === 'week' ? 7 : 1))
const keyOf = (d: Date, g: Gran): string =>
  g === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseKey = (k: string): Date => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d || 1)
}

// Continuous last-`max`-periods axis ending at today (empty periods -> 0),
// trimmed to start at the first period with any activity.
export function netSeries(rows: PointsLogRow[], g: Gran, max = 50): { key: string; net: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    const iso = r.date ? r.date.slice(0, 10) : ''
    if (!iso) continue
    const k = bucketKey(iso, g)
    m.set(k, (m.get(k) ?? 0) + r.amount)
  }
  if (m.size === 0) return []
  const earliest = [...m.keys()].reduce((a, b) => (a < b ? a : b))
  const latest = [...m.keys()].reduce((a, b) => (a > b ? a : b))
  const todayKey = keyOf(bucketStart(new Date(), g), g)
  const anchor = bucketStart(parseKey(latest > todayKey ? latest : todayKey), g) // include today, and any newest row
  const out: { key: string; net: number }[] = []
  for (let i = max - 1; i >= 0; i--) {
    const key = keyOf(stepBack(anchor, g, i), g)
    if (key < earliest) continue // no dead space before first-ever activity
    out.push({ key, net: m.get(key) ?? 0 })
  }
  return out
}

// Gate helper for the wrapping card: is there enough history to draw a graph?
export const dailyNetSeries = (rows: PointsLogRow[]) => netSeries(rows, 'day')

export default function DailyPointsChart({ rows }: { rows: PointsLogRow[] }) {
  const [g, setG] = useState<Gran>('day')
  const series = netSeries(rows, g)

  const W = 320
  const H = 96
  const PAD = 8
  const plotH = H - PAD * 2
  const nets = series.map((s) => s.net)
  const maxPos = Math.max(0, ...nets)
  const maxNeg = Math.min(0, ...nets)
  const range = maxPos - maxNeg || 1
  const zeroY = PAD + (maxPos / range) * plotH
  const slot = W / Math.max(series.length, 1)
  const barW = Math.min(slot * 0.62, 22)

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <div className="inline-flex rounded-lg bg-black/[0.04] p-0.5 text-[11px] font-semibold dark:bg-white/[0.06]">
          {PERIODS.map((p) => (
            <button
              key={p.g}
              onClick={() => setG(p.g)}
              className={`rounded-md px-2.5 py-1 transition ${
                g === p.g
                  ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {series.length < 2 ? (
        <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">Not enough history for this range.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
            <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />
            {series.map((s, i) => {
              const cx = slot * (i + 0.5)
              const h = (Math.abs(s.net) / range) * plotH
              const y = s.net >= 0 ? zeroY - h : zeroY
              return (
                <rect key={s.key} x={cx - barW / 2} y={y} width={barW} height={Math.max(h, 1)} rx={2} fill={s.net < 0 ? NEG : POS}>
                  <title>{`${labelOf(s.key, g)}: ${s.net >= 0 ? '+' : ''}${s.net.toLocaleString(undefined, { maximumFractionDigits: 1 })}`}</title>
                </rect>
              )
            })}
          </svg>
          <div className="mt-1 flex justify-between px-0.5 text-[10px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
            <span>{labelOf(series[0].key, g)}</span>
            <span>{labelOf(series[series.length - 1].key, g)}</span>
          </div>
        </>
      )}
    </div>
  )
}

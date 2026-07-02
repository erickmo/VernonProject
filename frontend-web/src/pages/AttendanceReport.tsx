import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageAttendance, useAttendanceReport } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'

const STATUSES = ['', 'Present', 'Late', 'EarlyLeave', 'Late+EarlyLeave', 'Absent', 'Excused-WFH', 'Excused-Leave', 'Holiday', 'OffDay']

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// ponytail: FALLBACK — columns come from the API at runtime, so DataTable (static Column<T>) can't be used here
const inputCls = 'rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink'

export default function AttendanceReport() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [fromDate, setFromDate] = useState(isoDaysAgo(30))
  const [toDate, setToDate] = useState(isoDaysAgo(0))
  const [employee, setEmployee] = useState('')
  const [brand, setBrand] = useState('')
  const [status, setStatus] = useState('')
  const [brands, setBrands] = useState<{ name: string }[]>([])

  useEffect(() => {
    resource.list<{ name: string }[]>('Brand', { fields: ['name'], limit: 0 }).then(setBrands).catch(() => {})
  }, [])

  const filters = useMemo(
    () => ({ from_date: fromDate, to_date: toDate, employee: employee || undefined, brand: brand || undefined, status: status || undefined }),
    [fromDate, toDate, employee, brand, status],
  )
  const { data, isFetching } = useAttendanceReport(filters, !!fromDate && !!toDate)

  const downloadCsv = () => {
    if (!data) return
    // ponytail: hand-rolled CSV — was pulling ~430KB of xlsx into the main bundle
    // (and duplicating it, since GanttChart already dynamic-imports xlsx) just to
    // write a plain CSV. RFC-4180 escaping + BOM so Excel reads UTF-8 correctly.
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = [
      data.columns.map((c) => c.label),
      ...data.rows.map((r) => data.columns.map((c) => r[c.fieldname] ?? '')),
    ]
    const csv = '﻿' + rows.map((row) => row.map(esc).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${fromDate}_${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (blocked) return null

  return (
    <Page>
      <PageHeader title="Attendance Report" />

      <BentoGrid>
        <BentoTile span="full" tone="plain">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">From
              <input type="date" className={inputCls} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">To
              <input type="date" className={inputCls} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Employee
              <input className={inputCls} placeholder="user id (optional)" value={employee} onChange={(e) => setEmployee(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Brand
              <select className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">All brands</option>
                {brands.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Status
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
              </select>
            </label>
            <button
              onClick={downloadCsv}
              disabled={!data || !data.rows.length}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            {isFetching && <Spinner className="h-4 w-4 text-brand-500" />}
          </div>
        </BentoTile>

        {data && (
          <>
            <BentoTile span="sm" tone="tint" accent="emerald"><BentoStat value={data.stats.present} label="Present" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="amber"><BentoStat value={data.stats.late} label="Late / early" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="rose"><BentoStat value={data.stats.absent} label="Absent" /></BentoTile>
            <BentoTile span="sm" tone="tint" accent="slate"><BentoStat value={Math.round(data.stats.penalty)} label="Penalty pts" /></BentoTile>
          </>
        )}

        <BentoTile span="full" tone="plain">
          {!data ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : data.rows.length === 0 ? (
            <EmptyState icon={Download} title="No rows" subtitle="No attendance for these filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    {data.columns.map((c) => (
                      <th key={c.fieldname} className="px-3 py-2 font-medium">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-b border-line/70 last:border-0 hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04]">
                      {data.columns.map((c) => (
                        <td key={c.fieldname} className="whitespace-nowrap px-3 py-2 align-middle text-ink">
                          {String(r[c.fieldname] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </Page>
  )
}

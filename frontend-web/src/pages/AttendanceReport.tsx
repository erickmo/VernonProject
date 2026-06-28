import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Download } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageAttendance, useAttendanceReport } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

const STATUSES = ['', 'Present', 'Late', 'EarlyLeave', 'Late+EarlyLeave', 'Absent', 'Excused-WFH', 'Excused-Leave', 'Holiday', 'OffDay']

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

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
    const aoa = [
      data.columns.map((c) => c.label),
      ...data.rows.map((r) => data.columns.map((c) => r[c.fieldname] ?? '')),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    XLSX.writeFile(wb, `attendance_${fromDate}_${toDate}.csv`, { bookType: 'csv' })
  }

  if (blocked) return null
  const inputCls = 'rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm'

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Attendance Report</h1>

      <BentoGrid>
        <BentoTile span="full" tone="plain">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">From
              <input type="date" className={inputCls} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">To
              <input type="date" className={inputCls} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Employee
              <input className={inputCls} placeholder="user id (optional)" value={employee} onChange={(e) => setEmployee(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Brand
              <select className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">All brands</option>
                {brands.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Status
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
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>{data.columns.map((c) => <th key={c.fieldname} className="px-4 py-2.5">{c.label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      {data.columns.map((c) => (
                        <td key={c.fieldname} className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-200">
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
    </div>
  )
}

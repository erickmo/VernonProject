import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Download, FileSpreadsheet } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { resource } from '@/lib/api'
import { useBoot, canManageAttendance, useAttendanceReport } from '@/hooks/useData'

const STATUSES = ['', 'Present', 'Late', 'EarlyLeave', 'Late+EarlyLeave', 'Absent', 'Excused-WFH', 'Excused-Leave', 'Holiday', 'OffDay']

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'
const card = 'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function AttendanceReportAdminScreen() {
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

  return (
    <DetailScreen title="Attendance report">
      <div className="flex flex-col gap-4">
        <div className={`${card} flex flex-col gap-3`}>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">From
              <input type="date" className={field} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">To
              <input type="date" className={field} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Employee
            <input className={field} placeholder="user id (optional)" value={employee} onChange={(e) => setEmployee(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Brand
            <SearchableSelect
              value={brand}
              onChange={setBrand}
              options={brands.map((b) => ({ value: b.name, label: b.name }))}
              placeholder="All brands"
              allowClear
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Status
            <SearchableSelect
              value={status}
              onChange={(v) => setStatus(v)}
              options={STATUSES.filter(Boolean).map((s) => ({ value: s, label: s }))}
              placeholder="All statuses"
              allowClear
            />
          </label>
          <button
            onClick={downloadCsv}
            disabled={!data || !data.rows.length}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>

        {data && (
          <div className="grid grid-cols-2 gap-3">
            <div className={`${card} text-center`}>
              <p className="text-2xl font-bold text-emerald-600">{data.stats.present}</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Present</p>
            </div>
            <div className={`${card} text-center`}>
              <p className="text-2xl font-bold text-amber-600">{data.stats.late}</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Late / early</p>
            </div>
            <div className={`${card} text-center`}>
              <p className="text-2xl font-bold text-rose-600">{data.stats.absent}</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Absent</p>
            </div>
            <div className={`${card} text-center`}>
              <p className="text-2xl font-bold text-slate-600 dark:text-slate-200">{Math.round(data.stats.penalty)}</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Penalty pts</p>
            </div>
          </div>
        )}

        {isFetching && !data ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !data ? null : data.rows.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} title="No rows" subtitle="No attendance for these filters." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-paper-edge bg-paper-card shadow-card dark:border-slate-700 dark:bg-slate-800">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>{data.columns.map((c) => <th key={c.fieldname} className="whitespace-nowrap px-4 py-2.5">{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {data.rows.map((r, i) => (
                  <tr key={i}>
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

        {isFetching && data && (
          <div className="flex justify-center"><Spinner className="h-4 w-4 text-brand-500" /></div>
        )}
      </div>
    </DetailScreen>
  )
}

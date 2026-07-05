import { useNavigate } from 'react-router-dom'
import { QrCode, CalendarPlus, ClipboardCheck } from 'lucide-react'
import { TabScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useMyAttendance } from '@/hooks/useData'

const STATUS_TONE: Record<string, string> = {
  Present: 'text-emerald-700 bg-emerald-50',
  Late: 'text-amber-700 bg-amber-50',
  EarlyLeave: 'text-amber-700 bg-amber-50',
  'Late+EarlyLeave': 'text-amber-700 bg-amber-50',
  Absent: 'text-rose-700 bg-rose-50',
  'Excused-WFH': 'text-sky-700 bg-sky-50',
  'Excused-Leave': 'text-sky-700 bg-sky-50',
  Holiday: 'text-violet-700 bg-violet-50',
  OffDay: 'text-stone-500 bg-stone-100',
}

export default function MyAttendance() {
  const navigate = useNavigate()
  const { data, isLoading } = useMyAttendance()
  const rows = data?.rows ?? []

  return (
    <TabScreen title="My attendance" subtitle="Your recent days">
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <button
          onClick={() => navigate('/scan')}
          className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-card active:scale-[0.99]"
        >
          <QrCode className="h-5 w-5" /> Scan
        </button>
        <button
          onClick={() => navigate('/attendance/request')}
          className="flex items-center justify-center gap-2 rounded-2xl bg-paper-card py-3 font-semibold text-stone-700 shadow-card active:scale-[0.99] dark:bg-slate-800 dark:text-slate-100"
        >
          <CalendarPlus className="h-5 w-5" /> Request leave
        </button>
        <button
          onClick={() => navigate('/attendance/approvals')}
          className="flex items-center justify-center gap-2 rounded-2xl bg-paper-card py-3 font-semibold text-stone-700 shadow-card active:scale-[0.99] dark:bg-slate-800 dark:text-slate-100"
        >
          <ClipboardCheck className="h-5 w-5" /> Approvals
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={QrCode} title="No attendance yet" subtitle="Scan a station to check in." />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div
              key={r.attendance_date}
              className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-800 dark:text-slate-100">{r.attendance_date}</p>
                <p className="truncate text-xs text-stone-400">
                  {r.first_scan ? `In ${r.first_scan.slice(11, 16)}` : '—'}
                  {r.last_scan ? ` · Out ${r.last_scan.slice(11, 16)}` : ''}
                  {r.penalty_points ? ` · −${r.penalty_points} pts` : ''}
                </p>
              </div>
              <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${STATUS_TONE[r.status] || 'bg-stone-100 text-stone-600'}`}>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </TabScreen>
  )
}

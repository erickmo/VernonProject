import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'

type Exc = { name: string; employee: string; exception_type: string; from_date: string; to_date: string; status: string; reason?: string }

export default function AttendanceExceptionsScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [list, setList] = useState<Exc[] | null>(null)
  const load = () =>
    resource
      .list<Exc[]>('Attendance Exception', {
        filters: { status: 'Pending' },
        fields: ['name', 'employee', 'exception_type', 'from_date', 'to_date', 'status', 'reason'],
        limit: 0,
      })
      .then(setList)
      .catch(() => setList([]))
  useEffect(() => {
    load()
  }, [])

  const decide = async (name: string, status: 'Approved' | 'Rejected') => {
    try {
      await resource.update('Attendance Exception', name, { status, approver: boot?.user })
      toast('success', status)
      load()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  if (blocked) return null

  return (
    <DetailScreen title="Leave / WFH">
      {list === null ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : list.length === 0 ? (
        <EmptyState icon={Check} title="All clear" subtitle="No pending requests." />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((e) => (
            <div
              key={e.name}
              className="rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="font-semibold text-stone-800 dark:text-slate-100">
                {e.employee} · {e.exception_type}
              </p>
              <p className="mt-0.5 text-xs text-stone-400">
                {e.from_date} → {e.to_date}
                {e.reason ? ` · ${e.reason}` : ''}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => decide(e.name, 'Approved')}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white active:scale-95"
                >
                  <Check className="h-4 w-4" /> Approve
                </button>
                <button
                  onClick={() => decide(e.name, 'Rejected')}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white active:scale-95"
                >
                  <X className="h-4 w-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}

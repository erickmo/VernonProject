import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile } from '@web/components/bento'

type Exc = { name: string; employee: string; exception_type: string; from_date: string; to_date: string; status: string; reason?: string }

export default function Exceptions() {
  const navigate = useNavigate()
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
    await resource.update('Attendance Exception', name, { status, approver: boot?.user })
    load()
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Leave / WFH requests</h1>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          {list === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : list.length === 0 ? (
            <EmptyState icon={Check} title="All clear" subtitle="No pending requests." />
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((e) => (
                <div key={e.name} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{e.employee} · {e.exception_type}</p>
                    <p className="text-xs text-slate-500">{e.from_date} → {e.to_date}{e.reason ? ` · ${e.reason}` : ''}</p>
                  </div>
                  <button onClick={() => decide(e.name, 'Approved')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"><Check className="h-4 w-4" /> Approve</button>
                  <button onClick={() => decide(e.name, 'Rejected')} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"><X className="h-4 w-4" /> Reject</button>
                </div>
              ))}
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}

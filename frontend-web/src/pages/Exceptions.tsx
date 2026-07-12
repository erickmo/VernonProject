import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance, useApproveException, useRejectException } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Card, CardList } from '@web/components/Card'

type Exc = { name: string; employee: string; exception_type: string; from_date: string; to_date: string; status: string; reason?: string }

export default function Exceptions() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const approve = useApproveException()
  const reject = useRejectException()

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
      if (status === 'Approved') await approve.mutateAsync(name)
      else await reject.mutateAsync({ name, reason: 'Rejected by admin' })
      toast('success', status)
      load()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Leave / WFH requests</h1>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          {list === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : list.length === 0 ? (
            <EmptyState icon={Check} title="All clear" subtitle="No pending requests." />
          ) : (
            <CardList>
              {list.map((e) => (
                <Card
                  key={e.name}
                  title={`${e.employee} · ${e.exception_type}`}
                  meta={<span>{e.from_date} → {e.to_date}{e.reason ? ` · ${e.reason}` : ''}</span>}
                  footer={
                    <>
                      <button onClick={() => decide(e.name, 'Approved')} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.99] transition"><Check className="h-4 w-4" /> Approve</button>
                      <button onClick={() => decide(e.name, 'Rejected')} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700 active:scale-[0.99] transition"><X className="h-4 w-4" /> Reject</button>
                    </>
                  }
                />
              ))}
            </CardList>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}

import { useParams } from 'react-router-dom'
import { UserCheck, UserX, Ticket } from 'lucide-react'
import { safeDecode } from '@web/lib/route'
import { Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useEventRoster, useCancelRegistration, useMarkAttended } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'

export default function EventRoster() {
  const { name: raw } = useParams()
  const event = safeDecode(raw)
  const toast = useToast()
  const confirm = useConfirm()
  const { data, isLoading, isError, refetch } = useEventRoster(event)
  const cancelReg = useCancelRegistration()
  const attend = useMarkAttended()
  const rows = (data ?? []).filter((r) => r.status !== 'Cancelled')

  const onCancel = async (name: string) => {
    if (!(await confirm({
      title: 'Cancel this registration?',
      message: 'Points are refunded automatically; the seat is freed.',
      confirmLabel: 'Cancel registration',
      destructive: true,
    }))) return
    cancelReg.mutate(name, {
      onSuccess: () => toast('success', 'Registration cancelled'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (isError) return <ErrorState onRetry={() => refetch()} />

  return (
    <Page>
      <PageHeader icon={Ticket} title="Registrations" />
      <DataTable
        rows={rows}
        columns={[
          { key: 'full_name', header: 'Name', sortValue: (r) => r.full_name,
            render: (r) => <span className="font-medium text-ink">{r.full_name}</span> },
          { key: 'status', header: 'Status',
            render: (r) => <span className="text-muted">{r.status}</span> },
          { key: 'method', header: 'Method',
            render: (r) => <span className="text-muted">{r.method}</span> },
          { key: 'amount', header: 'Amount',
            render: (r) => <span className="text-muted">{r.amount ?? '—'}</span> },
          { key: 'attended', header: 'Attended',
            render: (r) => (
              <button
                onClick={() => attend.mutate({ name: r.name, attended: r.attended ? 0 : 1 })}
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${r.attended ? 'bg-emerald-500 text-white' : 'bg-hover text-muted'}`}
                aria-label="Toggle attended"
              >
                <UserCheck className="h-4 w-4" />
              </button>
            ) },
          { key: 'cancel', header: '',
            render: (r) => (
              <button
                onClick={() => onCancel(r.name)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-hover text-rose-600"
                aria-label="Cancel registration"
              >
                <UserX className="h-4 w-4" />
              </button>
            ) },
        ]}
        getKey={(r) => r.name}
        empty={<span className="text-muted">No registrations</span>}
      />
    </Page>
  )
}

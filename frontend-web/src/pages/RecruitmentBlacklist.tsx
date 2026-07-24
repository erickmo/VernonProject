import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ban, Plus, Trash2 } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState, Button } from '@web/components/ui'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import { Dialog } from '@web/components/overlays/Dialog'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { recruitmentApi } from '@/lib/api'
import { formatDate } from '@/lib/format'

const field = 'w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none'
const area = 'min-h-[80px] w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none'

export default function RecruitmentBlacklist() {
  const toast = useToast()
  const confirm = useConfirm()
  const q = useQuery({ queryKey: ['recruitment', 'blacklist'], queryFn: () => recruitmentApi.listBlacklist() })

  const [open, setOpen] = useState(false)
  const [nik, setNik] = useState('')
  const [fullName, setFullName] = useState('')
  const [reason, setReason] = useState('')

  const add = async () => {
    if (!nik.trim()) return toast('error', 'NIK KTP wajib diisi')
    try {
      await recruitmentApi.addBlacklist(nik.trim(), fullName.trim(), reason.trim())
      toast('success', 'Ditambahkan ke blacklist')
      setOpen(false)
      setNik(''); setFullName(''); setReason('')
      q.refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const remove = async (row: { nik_ktp: string; full_name: string }) => {
    const ok = await confirm({ title: 'Hapus dari blacklist?', message: `KTP ${row.nik_ktp} (${row.full_name}) akan bisa melamar lagi.`, confirmLabel: 'Hapus' })
    if (!ok) return
    try {
      await recruitmentApi.removeBlacklist(row.nik_ktp)
      toast('success', 'Dihapus dari blacklist')
      q.refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <Page>
      <PageHeader
        icon={Ban}
        title="Blacklist"
        actions={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        }
      />

      {q.isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          rows={q.data ?? []}
          columns={[
            {
              key: 'nik_ktp',
              header: 'NIK KTP',
              sortValue: (r) => r.nik_ktp,
              render: (r) => <span className="font-medium text-ink">{r.nik_ktp}</span>,
            },
            {
              key: 'full_name',
              header: 'Name',
              sortValue: (r) => r.full_name,
              render: (r) => <span className="text-muted">{r.full_name}</span>,
            },
            {
              key: 'reason',
              header: 'Reason',
              render: (r) => <span className="text-muted">{r.reason || '—'}</span>,
            },
            {
              key: 'blacklisted_on',
              header: 'Since',
              sortValue: (r) => r.blacklisted_on ?? '',
              render: (r) => <span className="whitespace-nowrap text-muted">{formatDate(r.blacklisted_on)}</span>,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (r) => (
                <button onClick={() => remove(r)} aria-label="Remove"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-line text-rose-500 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-500/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              ),
            },
          ]}
          getKey={(r) => r.name}
          empty={<EmptyState icon={Ban} title="No blacklisted KTP" subtitle="Blocked NIK numbers appear here." />}
        />
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add to blacklist"
        onSubmit={add}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-hover/[0.04]">Batal</button>
            <button type="submit"
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Add</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">NIK KTP</label>
            <input className={field} value={nik} onChange={(e) => setNik(e.target.value)} placeholder="16 digit" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Nama</label>
            <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Alasan</label>
            <textarea className={area} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      </Dialog>
    </Page>
  )
}

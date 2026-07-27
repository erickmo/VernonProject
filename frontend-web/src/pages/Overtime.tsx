import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Clock, Trash2 } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useBoot, canHrApprove, isSystemManager, useUsers } from '@/hooks/useData'
import { overtimeApi } from '@/lib/api'
import type { OvertimeEntry } from '@/lib/types'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { DataTable, type Column } from '@web/components/DataTable'
import { DatePicker } from '@web/components/DatePicker'

const field = 'w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink'

const STATUS_CHIP: Record<OvertimeEntry['status'], string> = {
  Pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}
const STATUS_LABEL: Record<OvertimeEntry['status'], string> = {
  Pending: 'Menunggu', Approved: 'Disetujui', Rejected: 'Ditolak',
}

export default function Overtime() {
  const toast = useToast()
  const confirm = useConfirm()
  const { data: boot } = useBoot()
  const isManager = !!boot && canHrApprove(boot)
  const canApprove = !!boot && isSystemManager(boot)
  const { data: users } = useUsers()

  const [filterEmployee, setFilterEmployee] = useState('')
  const q = useQuery({
    queryKey: ['overtime', isManager ? `emp:${filterEmployee}` : 'self'],
    queryFn: () => overtimeApi.list(isManager && filterEmployee ? { employee: filterEmployee } : {}),
  })

  // Manager create form
  const [fEmployee, setFEmployee] = useState('')
  const [fDate, setFDate] = useState('')
  const [fMinutes, setFMinutes] = useState('')
  const [fReason, setFReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const userOptions = (users ?? []).map((u) => ({ value: u.name, label: `${u.full_name || u.name} (${u.name})` }))

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn()
      toast('success', okMsg)
      q.refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const submit = async () => {
    const m = Number(fMinutes)
    if (!fEmployee) return toast('error', 'Pilih karyawan')
    if (!fDate) return toast('error', 'Pilih tanggal')
    if (!m || Number.isNaN(m) || m <= 0) return toast('error', 'Isi menit lembur (lebih dari 0)')
    if (!fReason.trim()) return toast('error', 'Isi alasan lembur')
    setSubmitting(true)
    try {
      await overtimeApi.create({ employee: fEmployee, date: fDate, minutes: m, reason: fReason.trim() })
      toast('success', 'Lembur ditambahkan')
      setFDate(''); setFMinutes(''); setFReason('')
      q.refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const del = async (r: OvertimeEntry) => {
    const ok = await confirm({
      title: 'Hapus lembur?',
      message: `Hapus catatan lembur ${r.minutes} menit tanggal ${r.date}?`,
      confirmLabel: 'Hapus',
    })
    if (ok) run(() => overtimeApi.remove(r.name), 'Lembur dihapus')
  }

  const columns: Column<OvertimeEntry>[] = [
    { key: 'date', header: 'Tanggal', sortValue: (r) => r.date, render: (r) => <span className="text-ink">{r.date}</span> },
    ...(isManager ? [{ key: 'employee', header: 'Karyawan', sortValue: (r: OvertimeEntry) => r.employee, render: (r: OvertimeEntry) => <span className="text-ink">{r.employee}</span> } as Column<OvertimeEntry>] : []),
    { key: 'minutes', header: 'Menit', align: 'right', sortValue: (r) => r.minutes, render: (r) => <span className="tabular-nums font-semibold text-ink">{r.minutes}</span> },
    { key: 'reason', header: 'Alasan', render: (r) => <span className="text-muted">{r.reason || '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CHIP[r.status]}`}>{STATUS_LABEL[r.status]}</span>
          {canApprove && r.status !== 'Approved' && (
            <button
              type="button"
              onClick={() => run(() => overtimeApi.setStatus(r.name, 'Approved'), 'Lembur disetujui')}
              className="rounded border border-emerald-200 dark:border-emerald-500/40 px-1.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
            >
              Setujui
            </button>
          )}
          {isManager && r.status !== 'Rejected' && (
            <button
              type="button"
              onClick={() => run(() => overtimeApi.setStatus(r.name, 'Rejected'), 'Lembur ditolak')}
              className="rounded border border-line px-1.5 py-0.5 text-xs font-semibold text-muted hover:bg-hover/[0.04]"
            >
              Tolak
            </button>
          )}
          {isManager && (
            <button
              type="button"
              onClick={() => del(r)}
              aria-label="Hapus"
              className="rounded border border-rose-200 dark:border-rose-500/40 px-1.5 py-0.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink flex items-center gap-2">
        <Clock className="h-6 w-6 text-muted" />
        Lembur
      </h1>

      <BentoGrid>
        {isManager && (
          <BentoTile span="full" tone="plain" title="Tambah lembur">
            <div className="mt-2 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Karyawan</label>
                <SearchableSelect value={fEmployee} onChange={setFEmployee} options={userOptions} placeholder="Cari karyawan…" allowClear />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Tanggal *</label>
                <DatePicker value={fDate} onChange={setFDate} className={field} placeholder="Pilih tanggal" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Menit lembur *</label>
                <input type="number" min={1} className={field} value={fMinutes} onChange={(e) => setFMinutes(e.target.value)} placeholder="mis. 480" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Alasan *</label>
                <input className={field} value={fReason} onChange={(e) => setFReason(e.target.value)} placeholder="Alasan lembur" />
              </div>
              <div className="sm:col-span-2">
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.99] transition disabled:opacity-50"
                >
                  {submitting ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Simpan lembur
                </button>
              </div>
            </div>
          </BentoTile>
        )}

        {isManager && (
          <BentoTile span="full" tone="plain">
            <div className="max-w-md">
              <label className="mb-1 block text-xs font-semibold text-muted">Filter karyawan</label>
              <SearchableSelect value={filterEmployee} onChange={setFilterEmployee} options={userOptions} placeholder="Semua karyawan" allowClear />
            </div>
          </BentoTile>
        )}

        <BentoTile span="full" tone="plain">
          {q.isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <DataTable
              rows={q.data ?? []}
              columns={columns}
              getKey={(r) => r.name}
              empty={<EmptyState icon={Clock} title="Belum ada lembur" subtitle="Catatan jam lembur akan tampil di sini." />}
            />
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}

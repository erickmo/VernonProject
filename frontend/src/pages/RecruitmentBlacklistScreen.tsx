import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Ban, Plus, Trash2 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useBoot, canManageRecruitment } from '@/hooks/useData'
import { recruitmentApi } from '@/lib/api'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function RecruitmentBlacklistScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageRecruitment(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ['recruitmentBlacklist'],
    queryFn: () => recruitmentApi.listBlacklist(),
    enabled: canManageRecruitment(boot),
  })

  const [nik, setNik] = useState('')
  const [fullName, setFullName] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (blocked) return null

  const add = async () => {
    if (busy) return
    if (!nik.trim()) return toast('error', 'NIK KTP wajib diisi')
    if (!reason.trim()) return toast('error', 'Alasan wajib diisi')
    setBusy(true)
    try {
      await recruitmentApi.addBlacklist(nik.trim(), fullName.trim(), reason.trim())
      toast('success', 'Ditambahkan ke blacklist')
      setNik('')
      setFullName('')
      setReason('')
      refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: { nik_ktp: string; full_name: string }) => {
    if (!(await confirm({ title: `Hapus ${row.full_name || row.nik_ktp} dari blacklist?`, confirmLabel: 'Hapus', destructive: true }))) return
    try {
      await recruitmentApi.removeBlacklist(row.nik_ktp)
      toast('success', 'Dihapus dari blacklist')
      refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <DetailScreen title="Blacklist">
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Tambah ke blacklist</p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">NIK KTP</label>
              <input className={field} inputMode="numeric" value={nik} onChange={(e) => setNik(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Nama lengkap</label>
              <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Alasan</label>
              <textarea className={field + ' min-h-[60px] resize-y'} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <button
              onClick={add}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {busy ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Tambah
            </button>
          </div>
        </div>

        {isLoading ? (
          <Spinner className="mx-auto h-5 w-5 text-slate-400" />
        ) : !(rows ?? []).length ? (
          <EmptyState icon={Ban} title="Blacklist kosong" />
        ) : (
          <div className="flex flex-col gap-2">
            {(rows ?? []).map((r) => (
              <div key={r.name} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{r.full_name || r.nik_ktp}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">NIK: {r.nik_ktp}</p>
                  {r.reason && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.reason}</p>}
                  {r.blacklisted_on && <p className="mt-1 text-[11px] text-slate-300 dark:text-slate-600">{r.blacklisted_on}</p>}
                </div>
                <button onClick={() => remove(r)} className="shrink-0 text-rose-500 active:scale-90" aria-label="Hapus">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DetailScreen>
  )
}

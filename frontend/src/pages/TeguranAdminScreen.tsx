import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, X, Ban } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useBoot, canHrApprove } from '@/hooks/useData'
import { mobileApi } from '@/lib/api'
import { KATEGORI_OPTIONS } from '@/lib/teguran'
import type { TeguranKategori } from '@/lib/types'
import { TeguranCard } from './TeguranScreen'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function TeguranAdminScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canHrApprove(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()

  const [formOpen, setFormOpen] = useState(false)
  const [karyawan, setKaryawan] = useState('')
  const [kategori, setKategori] = useState<TeguranKategori>('Kinerja')
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10))
  const [deskripsi, setDeskripsi] = useState('')
  const [posting, setPosting] = useState(false)

  const { data: users } = useQuery({
    queryKey: ['grantUsers'],
    queryFn: () => mobileApi.listGrantUsers(),
    enabled: canHrApprove(boot),
  })
  const userOptions = useMemo(
    () => (users?.users ?? []).map((u) => ({ value: u.name, label: u.full_name || u.name })),
    [users],
  )
  const nameMap = useMemo(
    () => Object.fromEntries((users?.users ?? []).map((u) => [u.name, u.full_name || u.name])),
    [users],
  )

  const { data, isLoading } = useQuery({
    queryKey: ['teguranAll'],
    queryFn: () => mobileApi.getTeguranAll(),
    enabled: canHrApprove(boot),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['teguranAll'] })

  if (blocked) return null

  const submit = async () => {
    if (posting) return
    if (!karyawan) return toast('error', 'Pilih karyawan')
    if (deskripsi.trim().length < 20) return toast('error', 'Deskripsi minimal 20 karakter')
    setPosting(true)
    try {
      await mobileApi.terbitkanTeguran(karyawan, kategori, deskripsi.trim(), tanggal)
      toast('success', 'Teguran diterbitkan')
      setKaryawan('')
      setDeskripsi('')
      setFormOpen(false)
      refresh()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setPosting(false)
    }
  }

  const cancel = async (name: string) => {
    const alasan = await confirm({
      title: 'Batalkan Teguran ini?',
      message: 'Teguran yang dibatalkan tidak lagi dihitung untuk eskalasi SP. Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Batalkan',
      destructive: true,
      input: { placeholder: 'Alasan pembatalan (wajib)', rows: 3 },
    })
    if (!alasan || !alasan.trim()) return
    try {
      await mobileApi.batalkanTeguran(name, alasan.trim())
      toast('success', 'Teguran dibatalkan')
      refresh()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <DetailScreen
      title="Teguran (HR)"
      right={
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          {formOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {formOpen ? 'Tutup' : 'Terbitkan'}
        </button>
      }
    >
      {formOpen && (
        <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-4 dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Terbitkan Teguran baru</p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Karyawan</label>
              <SearchableSelect value={karyawan} onChange={setKaryawan} options={userOptions} placeholder="Pilih karyawan…" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Kategori Pelanggaran</label>
              <SearchableSelect value={kategori} onChange={(v) => setKategori(v as TeguranKategori)} options={KATEGORI_OPTIONS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Tanggal</label>
              <input type="date" className={field} value={tanggal} onChange={(e) => setTanggal(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Deskripsi</span>
                <span className={deskripsi.trim().length < 20 ? 'text-rose-500' : 'text-emerald-600'}>{deskripsi.trim().length}/20 min</span>
              </label>
              <textarea className={field + ' min-h-[90px] resize-y'} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} placeholder="Jelaskan pelanggaran secara spesifik…" />
            </div>
            <button
              onClick={submit}
              disabled={posting}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {posting ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Terbitkan
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Belum ada Teguran" subtitle="Teguran yang diterbitkan akan muncul di sini." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {data.map((t) => (
            <div key={t.name} className="relative">
              <TeguranCard t={t} mine={false} karyawanLabel={nameMap[t.karyawan]} ownerLabel={nameMap[t.diberikan_oleh]} />
              {t.status !== 'Dibatalkan' && (
                <button
                  onClick={() => cancel(t.name)}
                  className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-rose-600 active:opacity-70 dark:text-rose-400"
                >
                  <Ban className="h-3.5 w-3.5" /> Batalkan Teguran
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useBoot, canHrApprove, useUsers } from '@/hooks/useData'
import { mobileApi } from '@/lib/api'
import { KATEGORI_OPTIONS } from '@/lib/teguran'
import type { TeguranKategori } from '@/lib/types'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { DatePicker } from '@web/components/DatePicker'
import { TeguranTile } from './Teguran'

const field = 'w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink'

export default function TeguranAdmin() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canHrApprove(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { data: users } = useUsers()

  const [karyawan, setKaryawan] = useState('')
  const [kategori, setKategori] = useState<TeguranKategori>('Kinerja')
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10))
  const [deskripsi, setDeskripsi] = useState('')
  const [posting, setPosting] = useState(false)

  const userOptions = useMemo(
    () => (users ?? []).map((u) => ({ value: u.name, label: `${u.full_name || u.name} (${u.name})` })),
    [users],
  )
  const nameMap = useMemo(() => Object.fromEntries((users ?? []).map((u) => [u.name, u.full_name || u.name])), [users])

  const { data, isLoading } = useQuery({
    queryKey: ['teguranAll'],
    queryFn: () => mobileApi.getTeguranAll(),
    enabled: !blocked,
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
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Teguran (HR)</h1>

      <BentoGrid>
        <BentoTile span="full" tone="plain" title="Terbitkan Teguran baru">
          <div className="mt-2 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Karyawan</label>
              <SearchableSelect value={karyawan} onChange={setKaryawan} options={userOptions} placeholder="Cari karyawan…" allowClear />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Kategori Pelanggaran</label>
              <SearchableSelect value={kategori} onChange={(v) => setKategori(v as TeguranKategori)} options={KATEGORI_OPTIONS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Tanggal</label>
              <DatePicker value={tanggal} onChange={setTanggal} className={field} max={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 flex items-center justify-between text-xs font-semibold text-muted">
                <span>Deskripsi</span>
                <span className={deskripsi.trim().length < 20 ? 'text-rose-500' : 'text-emerald-600'}>{deskripsi.trim().length}/20 min</span>
              </label>
              <textarea className={field + ' min-h-[90px] resize-y'} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} placeholder="Jelaskan pelanggaran secara spesifik…" />
            </div>
            <div className="sm:col-span-2">
              <button
                onClick={submit}
                disabled={posting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-50"
              >
                {posting ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Terbitkan
              </button>
            </div>
          </div>
        </BentoTile>

        {isLoading ? (
          <BentoTile span="full" tone="plain"><div className="flex justify-center py-10"><Spinner /></div></BentoTile>
        ) : !data || data.length === 0 ? (
          <BentoTile span="full" tone="plain">
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <AlertTriangle className="h-8 w-8 text-muted" />
              <p className="font-semibold text-ink">Belum ada Teguran</p>
            </div>
          </BentoTile>
        ) : (
          data.map((t) => (
            <TeguranTile
              key={t.name}
              t={t}
              mine={false}
              karyawanLabel={nameMap[t.karyawan]}
              ownerLabel={nameMap[t.diberikan_oleh]}
              onCancel={() => cancel(t.name)}
            />
          ))
        )}
      </BentoGrid>
    </div>
  )
}

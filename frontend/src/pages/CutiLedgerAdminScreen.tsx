import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, RotateCcw } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useBoot, canHrApprove } from '@/hooks/useData'
import { mobileApi } from '@/lib/api'
import type { CutiLedgerEntryType } from '@/lib/types'
import { CutiStatement, YearSwitch } from './CutiLedgerScreen'

// HR may only post these — Grant/Cuti/Cuti Bersama are system-generated.
const ADJUST_OPTIONS: { value: CutiLedgerEntryType; label: string }[] = [
  { value: 'Carry-over', label: 'Saldo pindahan' },
  { value: 'Bonus', label: 'Bonus cuti' },
  { value: 'Correction', label: 'Koreksi' },
]

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function CutiLedgerAdminScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canHrApprove(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()

  const [employee, setEmployee] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [entryType, setEntryType] = useState<CutiLedgerEntryType>('Correction')
  const [days, setDays] = useState('')
  const [reason, setReason] = useState('')
  const [posting, setPosting] = useState(false)
  const [reminting, setReminting] = useState(false)

  const { data: users } = useQuery({
    queryKey: ['grantUsers'],
    queryFn: () => mobileApi.listGrantUsers(),
    enabled: canHrApprove(boot),
  })
  const userOptions = useMemo(
    () => (users?.users ?? []).map((u) => ({ value: u.name, label: u.full_name || u.name })),
    [users],
  )

  const ledgerKey = ['cutiLedger', 'admin', employee, year]
  const { data: ledger, isLoading } = useQuery({
    queryKey: ledgerKey,
    queryFn: () => mobileApi.getCutiLedger(employee, year),
    enabled: !!employee,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['cutiLedger', 'admin', employee, year] })

  if (blocked) return null

  const submit = async () => {
    if (posting) return
    if (!employee) return toast('error', 'Pilih karyawan')
    const d = Number(days)
    if (!Number.isFinite(d) || d === 0) return toast('error', 'Isi jumlah hari (bukan nol)')
    if ((entryType === 'Carry-over' || entryType === 'Bonus') && d < 0)
      return toast('error', 'Saldo pindahan / bonus harus positif')
    if (!reason.trim()) return toast('error', 'Alasan wajib diisi')
    setPosting(true)
    try {
      await mobileApi.postCutiAdjustment(employee, entryType, d, year, reason.trim())
      toast('success', 'Penyesuaian tersimpan')
      setDays('')
      setReason('')
      refresh()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setPosting(false)
    }
  }

  const remint = async () => {
    if (reminting || !employee) return
    const ok = await confirm({
      title: 'Re-mint kuota?',
      message: `Hitung ulang kuota tahunan ${year} untuk karyawan ini sesuai profil terbaru. Gunakan setelah kuota berubah.`,
      confirmLabel: 'Re-mint',
      cancelLabel: 'Batal',
    })
    if (!ok) return
    setReminting(true)
    try {
      await mobileApi.remintCutiGrant(employee, year)
      toast('success', 'Kuota diperbarui')
      refresh()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setReminting(false)
    }
  }

  return (
    <DetailScreen title="Penyesuaian Cuti">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Karyawan</label>
          <SearchableSelect
            value={employee}
            onChange={setEmployee}
            options={userOptions}
            placeholder="Pilih karyawan…"
          />
        </div>

        {employee && (
          <>
            <YearSwitch year={year} onChange={setYear} />

            {isLoading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : ledger ? (
              <CutiStatement data={ledger} />
            ) : null}

            {/* Adjustment form */}
            <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Posting penyesuaian</p>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Jenis</label>
                  <SearchableSelect
                    value={entryType}
                    onChange={(v) => setEntryType(v as CutiLedgerEntryType)}
                    options={ADJUST_OPTIONS}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Jumlah hari {entryType === 'Correction' ? '(boleh negatif)' : '(positif)'}
                  </label>
                  <input
                    className={field}
                    type="number"
                    inputMode="numeric"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Alasan</label>
                  <textarea
                    className={field + ' min-h-[80px] resize-y'}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <button
                  onClick={submit}
                  disabled={posting}
                  className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
                >
                  {posting ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Simpan penyesuaian
                </button>
              </div>
            </div>

            <button
              onClick={remint}
              disabled={reminting}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-stone-600 active:scale-95 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
            >
              {reminting ? <Spinner className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />} Re-mint kuota tahunan
            </button>
          </>
        )}
      </div>
    </DetailScreen>
  )
}

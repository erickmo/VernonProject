import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, RotateCcw } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useBoot, canHrApprove, useUsers } from '@/hooks/useData'
import { mobileApi } from '@/lib/api'
import type { CutiLedgerEntryType } from '@/lib/types'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { CutiStatement } from '@web/components/CutiStatement'

const YEAR = new Date().getFullYear()

const ADJ_TYPES: { value: CutiLedgerEntryType; label: string }[] = [
  { value: 'Carry-over', label: 'Saldo pindahan' },
  { value: 'Bonus', label: 'Bonus cuti' },
  { value: 'Correction', label: 'Koreksi (boleh minus)' },
]

const field = 'w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink'

export default function CutiLedgerAdmin() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canHrApprove(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const toast = useToast()
  const confirm = useConfirm()
  const { data: users } = useUsers()

  // Seed from ?user= so the user dashboard can deep-link one person.
  const [employee, setEmployee] = useState(() => new URLSearchParams(window.location.search).get('user') ?? '')
  const [year, setYear] = useState(YEAR)
  const [entryType, setEntryType] = useState<CutiLedgerEntryType>('Bonus')
  const [days, setDays] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reminting, setReminting] = useState(false)

  const q = useQuery({
    queryKey: ['cutiLedger', 'admin', employee, year],
    queryFn: () => mobileApi.getCutiLedger(employee, year),
    enabled: !!employee && !blocked,
  })

  const userOptions = useMemo(
    () => (users ?? []).map((u) => ({ value: u.name, label: `${u.full_name || u.name} (${u.name})` })),
    [users],
  )

  const submit = async () => {
    if (!employee) return toast('error', 'Pilih karyawan')
    const d = Number(days)
    if (days.trim() === '' || Number.isNaN(d) || d === 0) return toast('error', 'Isi jumlah hari (bukan 0)')
    if (!reason.trim()) return toast('error', 'Alasan wajib diisi')
    setSubmitting(true)
    try {
      await mobileApi.postCutiAdjustment(employee, entryType, d, year, reason.trim())
      toast('success', 'Penyesuaian tersimpan')
      setDays('')
      setReason('')
      q.refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const remint = async () => {
    if (!employee) return
    const ok = await confirm({
      title: 'Re-mint kuota?',
      message: `Hitung ulang kuota tahunan ${employee} untuk ${year} dari kuota di profil karyawan. Penyesuaian & cuti yang sudah tercatat tetap.`,
      confirmLabel: 'Re-mint',
    })
    if (!ok) return
    setReminting(true)
    try {
      await mobileApi.remintCutiGrant(employee, year)
      toast('success', 'Kuota diperbarui')
      q.refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setReminting(false)
    }
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Penyesuaian Cuti</h1>

      <BentoGrid>
        <BentoTile span="full" tone="plain">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-muted">Karyawan</label>
              <SearchableSelect
                value={employee}
                onChange={setEmployee}
                options={userOptions}
                placeholder="Cari karyawan…"
                allowClear
              />
            </div>
            <div className="flex gap-2">
              {[YEAR, YEAR - 1].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYear(y)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    year === y ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/15' : 'border-line text-muted'
                  }`}
                >
                  {y}
                </button>
              ))}
              <button
                type="button"
                onClick={remint}
                disabled={!employee || reminting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-hover disabled:opacity-50 transition active:scale-[0.99]"
              >
                {reminting ? <Spinner className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />} Re-mint kuota
              </button>
            </div>
          </div>
        </BentoTile>

        {employee && (
          <>
            <BentoTile span="full" tone="plain">
              <CutiStatement data={q.data} isLoading={q.isLoading} />
            </BentoTile>

            <BentoTile span="full" tone="plain" title="Tambah penyesuaian">
              <div className="mt-2 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Jenis</label>
                  <SearchableSelect
                    value={entryType}
                    onChange={(v) => setEntryType(v as CutiLedgerEntryType)}
                    options={ADJ_TYPES}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Jumlah hari</label>
                  <input
                    type="number"
                    className={field}
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    placeholder={entryType === 'Correction' ? 'mis. -2 atau 3' : 'mis. 3'}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-muted">Alasan</label>
                  <textarea
                    className="min-h-[70px] w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    onClick={submit}
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.99] transition disabled:opacity-50"
                  >
                    {submitting ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Simpan penyesuaian
                  </button>
                </div>
              </div>
            </BentoTile>
          </>
        )}
      </BentoGrid>
    </div>
  )
}

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Users } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useRequestException, useMyLeaders, useLeaveTypes } from '@/hooks/useData'
import { SearchableSelect } from '@/components/SearchableSelect'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { DatePicker } from '@web/components/DatePicker'

export default function RequestException() {
  const navigate = useNavigate()
  const toast = useToast()
  const req = useRequestException()
  const { data: leaders, isLoading: leadersLoading } = useMyLeaders()
  const { data: types } = useLeaveTypes()
  const [type, setType] = useState<'WFH' | 'Leave'>('Leave')
  const [leaveType, setLeaveType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [proof, setProof] = useState('')

  // list_leave_types already filters by the caller's gender server-side.
  const selectable = types || []
  const chosen = selectable.find((t) => t.name === leaveType)
  const hint = useMemo(() => {
    if (!chosen) return ''
    if (chosen.limit_kind === 'Annual Quota') return 'Kuota cuti tahunan Anda berlaku untuk kategori ini.'
    if (chosen.limit_kind === 'Per Event') return `Maksimal ${chosen.day_limit} hari per pengajuan.`
    return chosen.requires_proof ? 'Wajib melampirkan lampiran pendukung.' : 'Tanpa batas hari.'
  }, [chosen])

  const submit = async () => {
    if (!from || !to) return toast('error', 'Pilih kedua tanggal')
    if (type === 'Leave' && !leaveType) return toast('error', 'Pilih kategori cuti')
    if (type === 'Leave' && chosen?.requires_proof && !proof) return toast('error', 'Lampiran wajib diisi')
    try {
      await req.mutateAsync({
        from_date: from, to_date: to, exception_type: type, reason,
        ...(type === 'Leave' ? { leave_type: leaveType, proof } : {}),
      })
      toast('success', 'Pengajuan terkirim')
      navigate('/attendance/my-requests')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Ajukan Cuti / WFH</h1>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          <div className="flex max-w-xl flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Tipe</label>
              <div className="flex gap-2">
                {(['Leave', 'WFH'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition ${
                      type === t ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-muted'}`}>
                    {t === 'Leave' ? 'Cuti' : 'WFH'}
                  </button>
                ))}
              </div>
            </div>

            {type === 'Leave' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Kategori Cuti</label>
                <SearchableSelect
                  value={leaveType}
                  onChange={setLeaveType}
                  options={selectable.map((t) => ({ value: t.name, label: t.leave_name }))}
                  placeholder="Pilih kategori"
                />
                {hint && <p className="mt-1.5 text-xs text-brand-700">{hint}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Dari</label>
                <DatePicker value={from} onChange={setFrom} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Sampai</label>
                <DatePicker value={to} onChange={setTo} min={from || undefined} />
              </div>
            </div>

            {type === 'Leave' && chosen?.requires_proof && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Lampiran (URL/berkas)</label>
                <input className="w-full rounded-xl border border-line px-3 py-2 text-sm text-ink"
                  value={proof} onChange={(e) => setProof(e.target.value)} placeholder="Tautan surat dokter, dll." />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Alasan</label>
              <textarea className="w-full min-h-[90px] resize-y rounded-xl border border-line px-3 py-2 text-sm text-ink"
                value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>

            <div className="rounded-2xl border border-line p-3">
              <p className="text-xs font-semibold text-muted">Siapa yang meninjau</p>
              {leadersLoading ? <div className="py-2"><Spinner className="h-4 w-4" /></div>
                : leaders && leaders.length > 0 ? (
                  <>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {leaders.map((l) => (
                        <li key={l} className="flex items-center gap-1.5 text-sm text-ink">
                          <Users className="h-3.5 w-3.5 shrink-0 text-muted" /> {l}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted">Leader memberi masukan. HR memberi persetujuan akhir.</p>
                  </>
                ) : (
                  // True for both empty cases: no leaders exist, or the requester owns
                  // the project and outranks them. The list alone can't tell them apart.
                  <p className="mt-1 text-xs text-muted">Langsung ke HR.</p>
                )}
            </div>

            <button onClick={submit} disabled={req.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-700 active:scale-[0.99] transition disabled:opacity-50">
              {req.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Kirim pengajuan
            </button>
          </div>
        </BentoTile>
      </BentoGrid>
    </div>
  )
}

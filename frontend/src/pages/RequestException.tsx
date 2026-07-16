import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Users } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useRequestException, useMyLeaders, useLeaveTypes } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

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
      navigate('/attendance')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <DetailScreen title="Ajukan Cuti / WFH">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Tipe</label>
          <div className="flex gap-2">
            {(['Leave', 'WFH'] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold ${
                  type === t ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-500 dark:bg-slate-800 dark:border-slate-700'}`}>
                {t === 'Leave' ? 'Cuti' : 'WFH'}
              </button>
            ))}
          </div>
        </div>

        {type === 'Leave' && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Kategori Cuti</label>
            <div className="flex flex-col gap-1.5">
              {selectable.map((t) => (
                <button key={t.name} onClick={() => setLeaveType(t.name)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${
                    leaveType === t.name ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 bg-white text-slate-600 dark:bg-slate-800 dark:border-slate-700'}`}>
                  {t.leave_name}
                </button>
              ))}
            </div>
            {hint && <p className="mt-1.5 text-xs text-brand-700">{hint}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Dari</label>
            <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Sampai</label>
            <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {type === 'Leave' && chosen?.requires_proof && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Lampiran (URL/berkas)</label>
            <input className={field} value={proof} onChange={(e) => setProof(e.target.value)} placeholder="Tautan surat dokter, dll." />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Alasan</label>
          <textarea className={field + ' min-h-[90px] resize-y'} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <div className="rounded-2xl border border-paper-edge bg-paper-card p-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold text-stone-500">Siapa yang meninjau</p>
          {leadersLoading ? <div className="py-2"><Spinner className="h-4 w-4" /></div>
            : leaders && leaders.length > 0 ? (
              <>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {leaders.map((l) => (
                    <li key={l} className="flex items-center gap-1.5 text-sm text-stone-700 dark:text-slate-200">
                      <Users className="h-3.5 w-3.5 shrink-0 text-stone-400" /> {l}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-stone-400">Leader memberi masukan. HR memberi persetujuan akhir.</p>
              </>
            ) : <p className="mt-1 text-xs text-stone-400">Langsung ke HR.</p>}
        </div>

        <button onClick={submit} disabled={req.isPending}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white active:scale-95 disabled:opacity-50">
          {req.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Kirim pengajuan
        </button>
      </div>
    </DetailScreen>
  )
}

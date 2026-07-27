import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Check, X, Trash2, Plus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useBoot, canHrApprove } from '@/hooks/useData'
import { overtimeApi, mobileApi } from '@/lib/api'
import type { OvertimeEntry } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

const STATUS_TONE: Record<OvertimeEntry['status'], string> = {
  Pending: 'text-amber-700 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-400',
  Approved: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-400',
  Rejected: 'text-rose-700 bg-rose-50 dark:bg-rose-500/15 dark:text-rose-400',
}
const STATUS_LABEL: Record<OvertimeEntry['status'], string> = {
  Pending: 'Menunggu',
  Approved: 'Disetujui',
  Rejected: 'Ditolak',
}

export default function OvertimeScreen() {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { data: boot } = useBoot()
  const isManager = canHrApprove(boot)
  const isSM = !!boot?.roles.includes('System Manager')

  const { data: rows, isLoading } = useQuery({
    queryKey: ['overtime', 'list'],
    queryFn: () => overtimeApi.list(),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['overtime', 'list'] })

  // Employee picker (managers only).
  const { data: users } = useQuery({
    queryKey: ['grantUsers'],
    queryFn: () => mobileApi.listGrantUsers(),
    enabled: isManager,
  })
  const userOptions = useMemo(
    () => (users?.users ?? []).map((u) => ({ value: u.name, label: u.full_name || u.name })),
    [users],
  )

  // Create form state.
  const today = new Date().toISOString().slice(0, 10)
  const [employee, setEmployee] = useState('')
  const [date, setDate] = useState(today)
  const [minutes, setMinutes] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const create = async () => {
    if (saving) return
    if (!employee) return toast('error', 'Pilih karyawan')
    const m = Number(minutes)
    if (!Number.isFinite(m) || m <= 0) return toast('error', 'Isi jumlah menit lembur')
    if (!date) return toast('error', 'Pilih tanggal')
    if (!reason.trim()) return toast('error', 'Isi alasan lembur')
    setSaving(true)
    try {
      await overtimeApi.create({ employee, date, minutes: m, reason: reason.trim() })
      toast('success', 'Lembur dicatat')
      setEmployee('')
      setMinutes('')
      setReason('')
      setDate(today)
      refresh()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (row: OvertimeEntry, status: 'Approved' | 'Rejected') => {
    try {
      await overtimeApi.setStatus(row.name, status)
      toast('success', status === 'Approved' ? 'Lembur disetujui' : 'Lembur ditolak')
      refresh()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const remove = async (row: OvertimeEntry) => {
    const ok = await confirm({
      title: 'Hapus catatan lembur?',
      message: `${row.minutes} menit · ${row.date}`,
      confirmLabel: 'Hapus',
      cancelLabel: 'Batal',
    })
    if (!ok) return
    try {
      await overtimeApi.remove(row.name)
      toast('success', 'Catatan dihapus')
      refresh()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <DetailScreen title="Lembur">
      <div className="flex flex-col gap-4">
        {/* Create form — managers only */}
        {isManager && (
          <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Catat Lembur</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Karyawan</label>
                <SearchableSelect
                  value={employee}
                  onChange={setEmployee}
                  options={userOptions}
                  placeholder="Pilih karyawan…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Tanggal *</label>
                  <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Menit *</label>
                  <input
                    className={field}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Keterangan *</label>
                <textarea
                  className={field + ' min-h-[64px] resize-y'}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <button
                onClick={create}
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
              >
                {saving ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Simpan lembur
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !rows || rows.length === 0 ? (
          <EmptyState icon={Clock} title="Belum ada lembur" subtitle="Catatan lembur Anda akan muncul di sini." />
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div
                key={r.name}
                className="rounded-2xl border border-paper-edge bg-paper-card p-3.5 shadow-card dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">{r.minutes} menit</p>
                    <p className="text-xs text-stone-400">
                      {r.date}
                      {isManager && r.employee ? ` · ${r.employee}` : ''}
                    </p>
                    {r.reason && <p className="mt-0.5 truncate text-xs text-stone-400">{r.reason}</p>}
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${STATUS_TONE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>

                {isManager && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isSM && r.status !== 'Approved' && (
                      <button
                        onClick={() => setStatus(r, 'Approved')}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white active:scale-95"
                      >
                        <Check className="h-3.5 w-3.5" /> Setujui
                      </button>
                    )}
                    {r.status !== 'Rejected' && (
                      <button
                        onClick={() => setStatus(r, 'Rejected')}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-stone-600 active:scale-95 dark:border-slate-700 dark:text-slate-200"
                      >
                        <X className="h-3.5 w-3.5" /> Tolak
                      </button>
                    )}
                    <button
                      onClick={() => remove(r)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-rose-500 active:scale-95 dark:border-slate-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Hapus
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </DetailScreen>
  )
}

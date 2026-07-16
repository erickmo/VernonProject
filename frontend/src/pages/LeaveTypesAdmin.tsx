import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Tag } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useBoot, canHrApprove, useAdminLeaveTypes, useSaveLeaveType, useDeleteLeaveType } from '@/hooks/useData'
import type { LeaveType } from '@/lib/types'

const KIND_OPTIONS: { value: LeaveType['limit_kind']; label: string }[] = [
  { value: 'Annual Quota', label: 'Kuota tahunan' },
  { value: 'Per Event', label: 'Per kejadian' },
  { value: 'Documented', label: 'Berdokumen' },
]
const GENDER_OPTIONS: { value: LeaveType['gender']; label: string }[] = [
  { value: 'Any', label: 'Semua' },
  { value: 'Male', label: 'Pria' },
  { value: 'Female', label: 'Wanita' },
]
const KIND_LABEL: Record<LeaveType['limit_kind'], string> = {
  'Annual Quota': 'Kuota tahunan',
  'Per Event': 'Per kejadian',
  Documented: 'Berdokumen',
}
const GENDER_LABEL: Record<LeaveType['gender'], string> = { Any: 'Semua', Male: 'Pria', Female: 'Wanita' }

const NEW_TYPE: Partial<LeaveType> = { limit_kind: 'Per Event', gender: 'Any', enabled: 1, requires_proof: 0, day_limit: 0 }

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'
const card = 'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'

export default function LeaveTypesAdmin() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canHrApprove(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const { data: types, isLoading } = useAdminLeaveTypes()
  const save = useSaveLeaveType()
  const del = useDeleteLeaveType()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Partial<LeaveType> | null>(null)

  const submit = async () => {
    if (!editing) return
    if (!editing.leave_name?.trim()) return toast('error', 'Nama wajib diisi')
    try {
      await save.mutateAsync(editing)
      toast('success', 'Tersimpan')
      setEditing(null)
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const remove = async (t: LeaveType) => {
    const ok = await confirm({
      title: `Hapus ${t.leave_name}?`,
      message: 'Kategori yang sudah dipakai pengajuan tidak bisa dihapus — nonaktifkan saja.',
      confirmLabel: 'Hapus',
      cancelLabel: 'Batal',
      destructive: true,
    })
    if (!ok) return
    const r = await del.mutateAsync(t.name)
    if (r.status === 'error') toast('error', r.message || 'Gagal menghapus')
    else toast('success', 'Terhapus')
  }

  if (blocked) return null

  return (
    <DetailScreen title="Kategori Cuti">
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setEditing(NEW_TYPE)}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95"
          >
            <Plus className="h-4 w-4" /> Tambah kategori
          </button>

          {!types?.length ? (
            <EmptyState icon={Tag} title="Belum ada kategori" subtitle="Tambahkan kategori cuti di atas." />
          ) : (
            types.map((t) => (
              <div key={t.name} className={card}>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => setEditing(t)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-100">
                      {t.leave_name}
                      {!t.enabled ? ' (nonaktif)' : ''}
                    </p>
                    <p className="truncate text-xs text-stone-400 dark:text-slate-500">
                      {KIND_LABEL[t.limit_kind]}
                      {t.limit_kind !== 'Documented' ? ` · ${t.day_limit} hari` : ''}
                      {t.gender !== 'Any' ? ` · ${GENDER_LABEL[t.gender]}` : ''}
                      {t.requires_proof ? ' · lampiran' : ''}
                    </p>
                  </button>
                  {!t.is_default_annual && (
                    <button onClick={() => remove(t)} className="shrink-0 p-2 text-rose-500 active:scale-90">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {editing && (
            <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">
                {editing.name ? 'Edit kategori' : 'Kategori baru'}
              </p>
              <div className="flex flex-col gap-3">
                <input
                  className={field}
                  placeholder="Nama (mis. Cuti Tahunan)"
                  value={editing.leave_name || ''}
                  onChange={(e) => setEditing({ ...editing, leave_name: e.target.value })}
                />
                <Segmented options={KIND_OPTIONS} value={editing.limit_kind || 'Per Event'} onChange={(v) => setEditing({ ...editing, limit_kind: v })} />
                {editing.limit_kind !== 'Documented' && (
                  <input
                    className={field}
                    type="number"
                    placeholder="Batas hari"
                    value={editing.day_limit ?? 0}
                    onChange={(e) => setEditing({ ...editing, day_limit: Number(e.target.value) })}
                  />
                )}
                <Segmented options={GENDER_OPTIONS} value={editing.gender || 'Any'} onChange={(v) => setEditing({ ...editing, gender: v })} />
                <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={!!editing.requires_proof}
                    onChange={(e) => setEditing({ ...editing, requires_proof: e.target.checked ? 1 : 0 })}
                  />
                  Wajib lampiran bukti
                </label>
                <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={editing.enabled !== 0}
                    onChange={(e) => setEditing({ ...editing, enabled: e.target.checked ? 1 : 0 })}
                  />
                  Aktif
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={submit}
                    disabled={save.isPending}
                    className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
                  >
                    Simpan
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm dark:border-slate-700 dark:text-slate-200"
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </DetailScreen>
  )
}

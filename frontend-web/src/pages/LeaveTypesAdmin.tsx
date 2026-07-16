import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Tag } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useBoot, canHrApprove, useAdminLeaveTypes, useSaveLeaveType, useDeleteLeaveType } from '@/hooks/useData'
import type { LeaveType } from '@/lib/types'
import { Page, PageHeader } from '@web/components/Page'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { DataTable, type Column } from '@web/components/DataTable'
import { Sheet } from '@web/components/Sheet'
import { Button } from '@web/components/ui'

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

const field = 'rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink'

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

  const columns: Column<LeaveType>[] = [
    {
      key: 'leave_name',
      header: 'Nama',
      sortValue: (t) => t.leave_name,
      render: (t) => (
        <span className="font-medium text-ink">
          {t.leave_name}
          {!t.enabled && <span className="ml-1.5 text-xs font-normal text-muted">(nonaktif)</span>}
        </span>
      ),
    },
    {
      key: 'detail',
      header: 'Detail',
      render: (t) => (
        <span className="text-muted">
          {KIND_LABEL[t.limit_kind]}
          {t.limit_kind !== 'Documented' ? ` · ${t.day_limit} hari` : ''}
          {t.gender !== 'Any' ? ` · ${GENDER_LABEL[t.gender]}` : ''}
          {t.requires_proof ? ' · wajib lampiran' : ''}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (t) =>
        !t.is_default_annual && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              remove(t)
            }}
            className="p-1.5 text-rose-500 hover:text-rose-600"
            aria-label="Hapus"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ),
    },
  ]

  if (blocked) return null

  return (
    <Page>
      <PageHeader
        title="Kategori Cuti"
        subtitle="Jenis cuti/izin, batas hari, dan siapa yang bisa mengajukan."
        actions={
          <Button variant="primary" onClick={() => setEditing(NEW_TYPE)}>
            <Plus className="h-4 w-4" /> Tambah kategori
          </Button>
        }
      />

      <BentoGrid>
        <BentoTile span="full" tone="plain">
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <DataTable
              rows={types || []}
              columns={columns}
              getKey={(t) => t.name}
              onRowClick={(t) => setEditing(t)}
              empty={<EmptyState icon={Tag} title="Belum ada kategori" subtitle="Tambahkan kategori cuti di atas." />}
            />
          )}
        </BentoTile>
      </BentoGrid>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.name ? 'Edit kategori' : 'Kategori baru'} size="sm">
        {editing && (
          <form onSubmit={(e) => { e.preventDefault(); submit() }} className="space-y-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Nama
              <input
                autoFocus
                className={field}
                placeholder="mis. Cuti Tahunan"
                value={editing.leave_name || ''}
                onChange={(e) => setEditing({ ...editing, leave_name: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Jenis batas
              <SearchableSelect
                value={editing.limit_kind || 'Per Event'}
                onChange={(v) => setEditing({ ...editing, limit_kind: v as LeaveType['limit_kind'] })}
                options={KIND_OPTIONS}
              />
            </label>
            {editing.limit_kind !== 'Documented' && (
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Batas hari
                <input
                  type="number"
                  className={field}
                  value={editing.day_limit ?? 0}
                  onChange={(e) => setEditing({ ...editing, day_limit: Number(e.target.value) })}
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Berlaku untuk
              <SearchableSelect
                value={editing.gender || 'Any'}
                onChange={(v) => setEditing({ ...editing, gender: v as LeaveType['gender'] })}
                options={GENDER_OPTIONS}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={!!editing.requires_proof}
                onChange={(e) => setEditing({ ...editing, requires_proof: e.target.checked ? 1 : 0 })}
              />
              Wajib lampiran bukti
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={editing.enabled !== 0}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked ? 1 : 0 })}
              />
              Aktif
            </label>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={() => setEditing(null)} disabled={save.isPending}>Batal</Button>
              <Button type="submit" variant="primary" disabled={save.isPending}>
                {save.isPending && <Spinner className="h-4 w-4" />} Simpan
              </Button>
            </div>
          </form>
        )}
      </Sheet>
    </Page>
  )
}

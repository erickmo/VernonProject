import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, Check, Projector } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { deleteErrorMessage } from '@/lib/format'
import {
  useEquipmentItem,
  useCreateEquipment,
  useUpdateEquipment,
  useDeleteEquipment,
  useBoot,
  canManageResources,
} from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function EquipmentFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useEquipmentItem(name, isEdit)
  const create = useCreateEquipment()
  const update = useUpdateEquipment()
  const del = useDeleteEquipment()

  const [form, setForm] = useState<{ equipment_name: string; category: string; is_active: boolean }>({
    equipment_name: '',
    category: '',
    is_active: true,
  })

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        equipment_name: existing.equipment_name,
        category: existing.category ?? '',
        is_active: existing.is_active !== 0,
      })
    }
  }, [isEdit, existing])

  const blocked = !boot ? false : !canManageResources(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  if (isEdit && isLoading) {
    return (
      <DetailScreen title="Equipment">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const validate = (): string | null => {
    if (!form.equipment_name.trim()) return 'Equipment name is required'
    return null
  }

  const save = () => {
    const err = validate()
    if (err) {
      toast('error', err)
      return
    }
    const opts = {
      onSuccess: () => {
        toast('success', isEdit ? 'Equipment updated' : 'Equipment created')
        navigate('/equipment')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    const payload = {
      equipment_name: form.equipment_name.trim(),
      category: form.category.trim() || undefined,
      is_active: form.is_active ? 1 : 0,
    }
    if (isEdit) {
      update.mutate({ name, payload: { category: payload.category, is_active: payload.is_active } }, opts)
    } else {
      // ponytail: autoname:prompt requires name === equipment_name on create
      create.mutate({ name: payload.equipment_name, ...payload }, opts)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this equipment?', confirmLabel: 'Delete', destructive: true })))
      return
    del.mutate(name, {
      onSuccess: () => {
        toast('success', 'Equipment deleted')
        navigate('/equipment')
      },
      onError: (e) => toast('error', deleteErrorMessage(e, 'equipment')),
    })
  }

  const saving = create.isPending || update.isPending

  return (
    <DetailScreen title={isEdit ? 'Edit equipment' : 'New equipment'}>
      <div className="flex flex-col gap-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
          <Projector className="h-6 w-6" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Equipment name</label>
          <input
            className={field + (isEdit ? ' bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' : '')}
            value={form.equipment_name}
            readOnly={isEdit}
            onChange={(e) => setForm((f) => ({ ...f, equipment_name: e.target.value }))}
            placeholder="e.g. Projector A"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Category</label>
          <input
            className={field}
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="e.g. AV Equipment"
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            id="is_active"
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-brand-600"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          <label htmlFor="is_active" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Active
          </label>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isEdit ? 'Save changes' : 'Create equipment'}
        </button>

        {isEdit && (
          <button
            onClick={remove}
            disabled={del.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:bg-rose-50 disabled:opacity-60 dark:bg-slate-800 dark:active:bg-rose-500/15"
          >
            {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete equipment
          </button>
        )}
      </div>
    </DetailScreen>
  )
}

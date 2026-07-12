import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import { ArrowLeft, Trash2, Check } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
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
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

export default function EquipmentForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? safeDecode(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useEquipmentItem(name, isEdit)
  const create = useCreateEquipment()
  const update = useUpdateEquipment()
  const del = useDeleteEquipment()

  const [form, setForm] = useState<{
    equipment_name: string
    category: string
    is_active: boolean
  }>({ equipment_name: '', category: '', is_active: true })
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

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
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (isEdit && !isLoading && !existing) {
    return (
      <ErrorState
        title="Not found"
        subtitle="This equipment could not be found. It may have been deleted."
        onRetry={() => navigate('/equipment')}
      />
    )
  }

  const goBack = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Leave without saving?',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
      })
      if (!ok) return
    }
    navigate('/equipment')
  }

  const validate = (): string | null => {
    if (!form.equipment_name.trim()) return 'Equipment name is required'
    return null
  }

  const save = () => {
    const err = validate()
    if (err) {
      setError(err)
      toast('error', err)
      return
    }
    setError('')
    const opts = {
      onSuccess: () => {
        toast('success', isEdit ? 'Equipment updated' : 'Equipment created')
        navigate('/equipment')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    const equipmentName = form.equipment_name.trim()
    const payload: Record<string, unknown> = {
      equipment_name: equipmentName,
      category: form.category,
      is_active: form.is_active ? 1 : 0,
    }
    if (isEdit) {
      update.mutate({ name, payload }, opts)
    } else {
      // ponytail: autoname:prompt — name must be set explicitly on create
      create.mutate({ ...payload, name: equipmentName }, opts)
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
    <div className="space-y-6">
      <div>
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Equipment
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {isEdit ? 'Edit equipment' : 'New equipment'}
        </h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <BentoGrid>
          <BentoTile span="lg" tone="plain" title="Equipment details">
            <div className="mt-1 max-w-md space-y-4">
              <Field
                label="Equipment name"
                required
                error={error}
                hint={isEdit ? "Can't be changed after creation" : undefined}
              >
                {(id) => (
                  <input
                    id={id}
                    className={field + (isEdit ? ' bg-canvas text-muted' : '')}
                    value={form.equipment_name}
                    readOnly={isEdit}
                    autoFocus={!isEdit}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, equipment_name: e.target.value }))
                      setDirty(true)
                      if (error) setError('')
                    }}
                    placeholder="e.g. Projector A"
                  />
                )}
              </Field>

              <Field label="Category">
                {(id) => (
                  <input
                    id={id}
                    className={field}
                    value={form.category}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, category: e.target.value }))
                      setDirty(true)
                    }}
                    placeholder="e.g. AV Equipment"
                  />
                )}
              </Field>

              <Field label="Active">
                {(id) => (
                  <input
                    id={id}
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, is_active: e.target.checked }))
                      setDirty(true)
                    }}
                    className="h-4 w-4 rounded border-line accent-brand-600"
                  />
                )}
              </Field>

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {isEdit ? 'Save changes' : 'Create equipment'}
              </button>
            </div>
          </BentoTile>

          <BentoTile span="sm" tone="tint" accent="brand" title="Preview">
            <div className="mt-1 space-y-2">
              <p className="text-lg font-bold text-ink truncate">
                {form.equipment_name || <span className="opacity-40">Untitled</span>}
              </p>
              {form.category && <p className="text-xs text-muted">{form.category}</p>}
            </div>
          </BentoTile>

          {isEdit && (
            <BentoTile span="md" tone="plain" title="Danger zone">
              <div className="mt-1">
                <button
                  type="button"
                  onClick={remove}
                  disabled={del.isPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-surface py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:hover:bg-rose-500/10 transition-colors"
                >
                  {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}{' '}
                  Delete equipment
                </button>
              </div>
            </BentoTile>
          )}
        </BentoGrid>
      </form>
    </div>
  )
}

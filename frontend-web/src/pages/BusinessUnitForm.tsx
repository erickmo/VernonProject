import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import { ArrowLeft, Trash2, Check, ImagePlus, X } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { SearchableSelect } from '@/components/SearchableSelect'
import { uploadBusinessUnitImage } from '@/lib/api'
import { deleteErrorMessage } from '@/lib/format'
import {
  useBusinessUnit,
  useCompanies,
  useCreateBusinessUnit,
  useUpdateBusinessUnit,
  useDeleteBusinessUnit,
  useBoot,
  canManageBusinessUnits,
} from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

export default function BusinessUnitForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? safeDecode(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useBusinessUnit(name, isEdit)
  const create = useCreateBusinessUnit()
  const update = useUpdateBusinessUnit()
  const del = useDeleteBusinessUnit()
  const { data: companies } = useCompanies()

  const [form, setForm] = useState<{
    business_unit_name: string
    company: string
    description: string
    image: string | null
  }>({ business_unit_name: '', company: '', description: '', image: null })
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const patch = (p: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...p }))
    setDirty(true)
  }

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        business_unit_name: existing.business_unit_name,
        company: existing.company ?? '',
        description: existing.description ?? '',
        image: existing.image ?? null,
      })
    }
  }, [isEdit, existing])

  const blocked = !boot ? false : !canManageBusinessUnits(boot)
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
        subtitle="This business unit could not be found. It may have been deleted."
        onRetry={() => navigate('/business-units')}
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
    navigate('/business-units')
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const url = await uploadBusinessUnitImage(f)
      patch({ image: url })
      toast('success', 'Image uploaded')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = () => {
    if (!form.business_unit_name.trim()) {
      setError('Business unit name is required')
      toast('error', 'Business unit name is required')
      return
    }
    setError('')
    const opts = {
      onSuccess: () => {
        setDirty(false)
        toast('success', isEdit ? 'Business unit updated' : 'Business unit created')
        navigate('/business-units')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    const shared = {
      company: form.company || null,
      description: form.description.trim() || null,
      image: form.image ?? null,
    }
    if (isEdit) update.mutate({ name, payload: shared }, opts)
    else create.mutate({ business_unit_name: form.business_unit_name.trim(), ...shared }, opts)
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this business unit?', confirmLabel: 'Delete', destructive: true })))
      return
    del.mutate(name, {
      onSuccess: () => {
        setDirty(false)
        toast('success', 'Business unit deleted')
        navigate('/business-units')
      },
      onError: (e) => toast('error', deleteErrorMessage(e, 'business unit')),
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
          <ArrowLeft className="h-3.5 w-3.5" /> Business Units
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {isEdit ? 'Edit business unit' : 'New business unit'}
        </h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <BentoGrid>
          {/* Field tile */}
          <BentoTile span="lg" tone="plain" title="Business unit details">
            <div className="mt-1 max-w-md space-y-4">
              <Field
                label="Business unit name"
                required
                error={error}
                hint={isEdit ? "Can't be changed after creation" : undefined}
              >
                {(id) => (
                  <input
                    id={id}
                    className={field + (isEdit ? ' bg-canvas text-muted' : '')}
                    value={form.business_unit_name}
                    readOnly={isEdit}
                    autoFocus={!isEdit}
                    onChange={(e) => {
                      patch({ business_unit_name: e.target.value })
                      if (error) setError('')
                    }}
                    placeholder="e.g. Retail Division"
                  />
                )}
              </Field>

              <Field label="Company">
                {(id) => (
                  <SearchableSelect
                    id={id}
                    value={form.company}
                    onChange={(v) => patch({ company: v })}
                    options={(companies ?? []).map((c) => ({ value: c.name, label: c.company_name }))}
                    placeholder="No company"
                    allowClear
                  />
                )}
              </Field>

              <Field label="Description">
                {(id) => (
                  <textarea
                    id={id}
                    className={field}
                    rows={3}
                    value={form.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    placeholder="Optional details"
                  />
                )}
              </Field>

              <button
                type="submit"
                disabled={saving || uploading}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {isEdit ? 'Save changes' : 'Create business unit'}
              </button>
            </div>
          </BentoTile>

          {/* Preview / image tile */}
          <BentoTile span="sm" tone="tint" accent="brand" title="Preview">
            <div className="mt-1 space-y-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-brand-300 bg-brand-50/50 text-muted hover:border-brand-400 dark:border-brand-600/40 dark:bg-brand-500/5"
              >
                {uploading ? (
                  <span className="flex flex-col items-center gap-1 text-xs">
                    <Spinner className="h-5 w-5" /> Uploading…
                  </span>
                ) : form.image ? (
                  <img src={form.image} alt="" className="h-full w-full object-cover rounded-xl" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-xs">
                    <ImagePlus className="h-6 w-6" /> Click to upload
                  </span>
                )}
              </button>
              {form.image && !uploading && (
                <button
                  type="button"
                  onClick={() => patch({ image: null })}
                  className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 dark:hover:text-rose-400"
                >
                  <X className="h-3.5 w-3.5" /> Remove image
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />

              <div>
                <p className="text-lg font-bold text-ink truncate">
                  {form.business_unit_name || <span className="opacity-40">Untitled</span>}
                </p>
                <p className="text-xs text-muted">{form.company || 'Business Unit'}</p>
              </div>
            </div>
          </BentoTile>

          {/* Danger zone (edit only) */}
          {isEdit && (
            <BentoTile span="md" tone="plain" title="Danger zone">
              <div className="mt-1 space-y-4">
                <button
                  type="button"
                  onClick={remove}
                  disabled={del.isPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-surface py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:hover:bg-rose-500/10 transition-colors"
                >
                  {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete business unit
                </button>
              </div>
            </BentoTile>
          )}
        </BentoGrid>
      </form>
    </div>
  )
}

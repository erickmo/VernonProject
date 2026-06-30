import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2, Check } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { MergeIntoCard } from '@/components/MergeIntoCard'
import { deleteErrorMessage } from '@/lib/format'
import {
  useBrand,
  useBrands,
  useCreateBrand,
  useUpdateBrand,
  useDeleteBrand,
  useMergeBrand,
  useBoot,
  canManageBrands,
} from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function BrandForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useBrand(name, isEdit)
  const create = useCreateBrand()
  const update = useUpdateBrand()
  const del = useDeleteBrand()
  const merge = useMergeBrand()
  const { data: allBrands } = useBrands()

  const [form, setForm] = useState<{ brand_name: string }>({ brand_name: '' })
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isEdit && existing) {
      setForm({ brand_name: existing.brand_name })
    }
  }, [isEdit, existing])

  const blocked = !boot ? false : !canManageBrands(boot)
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
        subtitle="This brand could not be found. It may have been deleted."
        onRetry={() => navigate('/brands')}
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
    navigate('/brands')
  }

  const validate = (): string | null => {
    if (!form.brand_name.trim()) return 'Brand name is required'
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
    const payload = { brand_name: form.brand_name.trim() }
    const opts = {
      onSuccess: () => {
        toast('success', isEdit ? 'Brand updated' : 'Brand created')
        navigate('/brands')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    if (isEdit) update.mutate({ name, payload }, opts)
    else create.mutate(payload, opts)
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this brand?', confirmLabel: 'Delete', destructive: true })))
      return
    del.mutate(name, {
      onSuccess: () => {
        toast('success', 'Brand deleted')
        navigate('/brands')
      },
      onError: (e) => toast('error', deleteErrorMessage(e, 'brand')),
    })
  }

  const doMerge = (target: string) =>
    merge.mutate(
      { source: name, target },
      {
        onSuccess: () => {
          toast('success', 'Brands merged')
          navigate('/brands')
        },
        onError: (e) => toast('error', (e as Error).message),
      },
    )

  const mergeOptions = (allBrands ?? [])
    .filter((b) => b.name !== name)
    .map((b) => ({ value: b.name, label: b.brand_name }))

  const saving = create.isPending || update.isPending

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Brands
        </button>
        <h1 className="text-2xl font-bold">{isEdit ? 'Edit brand' : 'New brand'}</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <BentoGrid>
          {/* Field tile */}
          <BentoTile span="lg" tone="plain" title="Brand details">
            <div className="mt-1 max-w-md space-y-4">
              <Field
                label="Brand name"
                required
                error={error}
                hint={isEdit ? "Can't be changed after creation" : undefined}
              >
                {(id) => (
                  <input
                    id={id}
                    className={field + (isEdit ? ' bg-slate-100 text-muted dark:bg-slate-700' : '')}
                    value={form.brand_name}
                    readOnly={isEdit}
                    autoFocus={!isEdit}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, brand_name: e.target.value }))
                      setDirty(true)
                      if (error) setError('')
                    }}
                    placeholder="e.g. Acme"
                  />
                )}
              </Field>

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {isEdit ? 'Save changes' : 'Create brand'}
              </button>
            </div>
          </BentoTile>

          {/* Preview / summary tile */}
          <BentoTile span="sm" tone="tint" accent="slate" title="Preview">
            <div className="mt-1 space-y-2">
              <p className="text-lg font-bold text-ink truncate">
                {form.brand_name || <span className="opacity-40">Untitled</span>}
              </p>
              <p className="text-xs text-muted">Brand</p>
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
                  {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete brand
                </button>

                {mergeOptions.length > 0 && (
                  <MergeIntoCard
                    entity="brand"
                    currentLabel={existing?.brand_name || name}
                    options={mergeOptions}
                    isPending={merge.isPending}
                    onConfirm={doMerge}
                  />
                )}
              </div>
            </BentoTile>
          )}
        </BentoGrid>
      </form>
    </div>
  )
}

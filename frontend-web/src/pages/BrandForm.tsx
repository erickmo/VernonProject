import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import { ArrowLeft, Trash2, Check } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { MergeIntoCard } from '@/components/MergeIntoCard'
import { SearchableSelect } from '@/components/SearchableSelect'
import { deleteErrorMessage } from '@/lib/format'
import { BRAND_WEEKDAY_KEYS } from '@/lib/types'
import {
  useBrand,
  useBrands,
  useCompanies,
  useCreateBrand,
  useUpdateBrand,
  useDeleteBrand,
  useMergeBrand,
  useBoot,
  canManageBrands,
} from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function BrandForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? safeDecode(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useBrand(name, isEdit)
  const create = useCreateBrand()
  const update = useUpdateBrand()
  const del = useDeleteBrand()
  const merge = useMergeBrand()
  const { data: allBrands } = useBrands()
  const { data: companies } = useCompanies()

  const [form, setForm] = useState<{ brand_name: string; company: string }>({ brand_name: '', company: '' })
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [minByWeekday, setMinByWeekday] = useState<string[]>(['0', '0', '0', '0', '0', '0', '0'])

  useEffect(() => {
    if (isEdit && existing) {
      setForm({ brand_name: existing.brand_name, company: existing.company })
      setMinByWeekday(BRAND_WEEKDAY_KEYS.map((k) => String(existing[k] ?? 0)))
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
    if (!form.company) return 'Company is required'
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
        toast('success', isEdit ? 'Brand updated' : 'Brand created')
        navigate('/brands')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    const n = (s: string) => (s === '' ? 0 : Number(s))
    const weekdays = Object.fromEntries(BRAND_WEEKDAY_KEYS.map((k, i) => [k, n(minByWeekday[i])]))
    if (isEdit) update.mutate({ name, payload: { company: form.company, ...weekdays } }, opts)
    else create.mutate({ brand_name: form.brand_name.trim(), company: form.company, ...weekdays }, opts)
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
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{isEdit ? 'Edit brand' : 'New brand'}</h1>
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
                    className={field + (isEdit ? ' bg-canvas text-muted' : '')}
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

              <Field label="Company" required>
                {(id) => (
                  <SearchableSelect
                    id={id}
                    value={form.company}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, company: v }))
                      setDirty(true)
                      if (error) setError('')
                    }}
                    options={(companies ?? []).map((c) => ({ value: c.name, label: c.company_name }))}
                    placeholder="Select a company…"
                  />
                )}
              </Field>

              <div>
                <p className="mb-1 text-xs font-semibold text-muted">Minimum minutes per weekday</p>
                <p className="mb-2 text-xs text-muted">0 = this brand does not work that day (no recurring todos land there).</p>
                <div className="grid grid-cols-2 gap-2">
                  {WEEKDAY_LABELS.map((lbl, i) => (
                    <label key={lbl} className="flex items-center gap-2">
                      <span className="w-9 shrink-0 text-xs font-medium text-muted">{lbl}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className={field}
                        value={minByWeekday[i]}
                        onChange={(e) => {
                          setMinByWeekday((m) => m.map((v, k) => (k === i ? e.target.value : v)))
                          setDirty(true)
                        }}
                        placeholder="0"
                      />
                    </label>
                  ))}
                </div>
              </div>

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
          <BentoTile span="sm" tone="tint" accent="brand" title="Preview">
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

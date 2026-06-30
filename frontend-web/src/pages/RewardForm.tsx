import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Trash2, Check, ImagePlus, ArrowLeft, X } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { uploadRewardImage } from '@/lib/api'
import { deleteErrorMessage, formatNumber } from '@/lib/format'
import {
  useReward,
  useCreateReward,
  useUpdateReward,
  useDeleteReward,
  useBoot,
  canManageMarketplace,
} from '@/hooks/useData'
import type { RewardFormPayload } from '@/lib/types'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

const empty: RewardFormPayload = {
  reward_name: '',
  point_cost: 0,
  stock_quantity: 0,
  active: 1,
  description: '',
  image: null,
}

type Errors = { reward_name?: string; point_cost?: string; stock_quantity?: string }

export default function RewardForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useReward(name, isEdit)
  const create = useCreateReward()
  const update = useUpdateReward()
  const del = useDeleteReward()

  const [form, setForm] = useState<RewardFormPayload>(empty)
  const [errors, setErrors] = useState<Errors>({})
  const [dirty, setDirty] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const costRef = useRef<HTMLInputElement>(null)
  const stockRef = useRef<HTMLInputElement>(null)

  const patch = (p: Partial<RewardFormPayload>) => {
    setForm((f) => ({ ...f, ...p }))
    setDirty(true)
  }

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        reward_name: existing.reward_name,
        point_cost: existing.point_cost,
        stock_quantity: existing.stock_quantity,
        active: existing.active,
        description: existing.description ?? '',
        image: existing.image ?? null,
      })
    }
  }, [isEdit, existing])

  const blocked = !boot ? false : !canManageMarketplace(boot)
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

  // Edit deep-link not-found guard.
  if (isEdit && !isLoading && !existing) {
    return (
      <div className="space-y-5 max-w-2xl">
        <Link
          to="/marketplace-admin"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" /> Marketplace Admin
        </Link>
        <ErrorState title="Not found" subtitle="This reward doesn't exist or was deleted." />
      </div>
    )
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const url = await uploadRewardImage(f)
      patch({ image: url })
      toast('success', 'Image uploaded')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const validate = (): Errors => {
    const errs: Errors = {}
    if (!form.reward_name.trim()) errs.reward_name = 'Reward name is required'
    if (form.point_cost < 0) errs.point_cost = 'Point cost must be zero or more'
    if (form.stock_quantity < 0) errs.stock_quantity = 'Stock must be zero or more'
    return errs
  }

  const save = () => {
    const errs = validate()
    setErrors(errs)
    if (errs.reward_name || errs.point_cost || errs.stock_quantity) {
      toast('error', errs.reward_name || errs.point_cost || errs.stock_quantity!)
      if (errs.reward_name) nameRef.current?.focus()
      else if (errs.point_cost) costRef.current?.focus()
      else stockRef.current?.focus()
      return
    }
    const payload: RewardFormPayload = {
      reward_name: form.reward_name.trim(),
      point_cost: Number(form.point_cost),
      stock_quantity: Number(form.stock_quantity),
      active: form.active,
      description: (form.description ?? '').trim(),
      image: form.image ?? null,
    }
    const opts = {
      onSuccess: () => {
        setDirty(false)
        toast('success', isEdit ? 'Reward updated' : 'Reward created')
        navigate('/marketplace-admin')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    if (isEdit) update.mutate({ name, payload }, opts)
    else create.mutate(payload, opts)
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this reward?', confirmLabel: 'Delete', destructive: true }))) return
    del.mutate(name, {
      onSuccess: () => {
        setDirty(false)
        toast('success', 'Reward deleted')
        navigate('/marketplace-admin')
      },
      onError: (e) => toast('error', deleteErrorMessage(e, 'reward')),
    })
  }

  const onBack = async (e: React.MouseEvent) => {
    if (!dirty) return
    e.preventDefault()
    const ok = await confirm({
      title: 'Discard changes?',
      message: 'You have unsaved changes that will be lost.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      destructive: true,
    })
    if (ok) navigate('/marketplace-admin')
  }

  const saving = create.isPending || update.isPending

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="space-y-5"
    >
      <div className="space-y-2">
        <Link
          to="/marketplace-admin"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" /> Marketplace Admin
        </Link>
        <h1 className="text-2xl font-bold">{isEdit ? 'Edit reward' : 'New reward'}</h1>
      </div>

      <BentoGrid>
        {/* Details tile */}
        <BentoTile span="lg" tone="plain" title="Details">
          <div className="mt-1 flex flex-col gap-5">
            <Field label="Reward name" required error={errors.reward_name}>
              {(id) => (
                <input
                  id={id}
                  ref={nameRef}
                  autoFocus={!isEdit}
                  className={field}
                  value={form.reward_name}
                  onChange={(e) => {
                    patch({ reward_name: e.target.value })
                    if (errors.reward_name) setErrors((s) => ({ ...s, reward_name: undefined }))
                  }}
                  placeholder="e.g. Coffee Voucher"
                />
              )}
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Point cost" required error={errors.point_cost}>
                {(id) => (
                  <input
                    id={id}
                    ref={costRef}
                    type="text"
                    inputMode="numeric"
                    className={field}
                    value={formatNumber(form.point_cost)}
                    onChange={(e) =>
                      patch({ point_cost: Number(e.target.value.replace(/[^\d]/g, '')) })
                    }
                  />
                )}
              </Field>
              <Field label="Stock" required error={errors.stock_quantity}>
                {(id) => (
                  <input
                    id={id}
                    ref={stockRef}
                    type="text"
                    inputMode="numeric"
                    className={field}
                    value={formatNumber(form.stock_quantity)}
                    onChange={(e) =>
                      patch({ stock_quantity: Number(e.target.value.replace(/[^\d]/g, '')) })
                    }
                  />
                )}
              </Field>
            </div>

            <label className="flex items-center justify-between rounded-xl border border-line px-3 py-3 dark:border-slate-700">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Active</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={form.active === 1}
                onChange={(e) => patch({ active: e.target.checked ? 1 : 0 })}
              />
            </label>

            <Field label="Description">
              {(id) => (
                <textarea
                  id={id}
                  className={field}
                  rows={3}
                  value={form.description ?? ''}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="Optional details"
                />
              )}
            </Field>

            <div className="flex items-center justify-between gap-3">
              {isEdit ? (
                <button
                  type="button"
                  onClick={remove}
                  disabled={del.isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:hover:bg-rose-500/10"
                >
                  {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete reward
                </button>
              ) : (
                <span />
              )}

              <button
                type="submit"
                disabled={saving || uploading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {isEdit ? 'Save changes' : 'Create reward'}
              </button>
            </div>
          </div>
        </BentoTile>

        {/* Live reward-card preview tile */}
        <BentoTile span="sm" tone="tint" accent="emerald" title="Preview">
          <div className="mt-1 space-y-3">
            {/* Image upload area */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex h-32 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 text-muted hover:border-emerald-400 dark:border-emerald-600/40 dark:bg-emerald-500/5"
            >
              {uploading ? (
                <span className="flex flex-col items-center gap-1 text-xs">
                  <Spinner className="h-5 w-5" /> Uploading…
                </span>
              ) : form.image ? (
                <img src={form.image} alt="" className="h-full w-full object-cover rounded-lg" />
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

            {/* Card preview */}
            <div className="rounded-xl bg-surface p-3 shadow-sm">
              <p className="truncate font-semibold text-ink">
                {form.reward_name || 'Untitled reward'}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-brand-600">{formatNumber(form.point_cost)} pts</p>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  form.active === 1
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {form.active === 1 ? 'Active' : 'Inactive'} · {formatNumber(form.stock_quantity)} in stock
              </span>
            </div>
          </div>
        </BentoTile>
      </BentoGrid>
    </form>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Trash2, Check, ImagePlus, ArrowLeft } from 'lucide-react'
import { Spinner } from '@/components/ui'
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
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

const empty: RewardFormPayload = {
  reward_name: '',
  point_cost: 0,
  stock_quantity: 0,
  active: 1,
  description: '',
  image: null,
}

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
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const url = await uploadRewardImage(f)
      setForm((s) => ({ ...s, image: url }))
      toast('success', 'Image uploaded')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const validate = (): string | null => {
    if (!form.reward_name.trim()) return 'Reward name is required'
    if (form.point_cost < 0) return 'Point cost must be zero or more'
    if (form.stock_quantity < 0) return 'Stock must be zero or more'
    return null
  }

  const save = () => {
    const err = validate()
    if (err) {
      toast('error', err)
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
        toast('success', 'Reward deleted')
        navigate('/marketplace-admin')
      },
      onError: (e) => toast('error', deleteErrorMessage(e, 'reward')),
    })
  }

  const saving = create.isPending || update.isPending

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="space-y-2">
        <Link
          to="/marketplace-admin"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" /> Marketplace admin
        </Link>
        <h1 className="text-2xl font-bold">{isEdit ? 'Edit reward' : 'New reward'}</h1>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-6 flex flex-col gap-5">
        {/* Image */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Image</label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-44 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800"
          >
            {uploading ? (
              <Spinner className="h-5 w-5" />
            ) : form.image ? (
              <img src={form.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-xs">
                <ImagePlus className="h-6 w-6" /> Click to upload
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Reward name</label>
          <input
            className={field}
            value={form.reward_name}
            onChange={(e) => setForm((f) => ({ ...f, reward_name: e.target.value }))}
            placeholder="e.g. Coffee Voucher"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Point cost</label>
            <input
              type="text"
              inputMode="numeric"
              className={field}
              value={formatNumber(form.point_cost)}
              onChange={(e) => setForm((f) => ({ ...f, point_cost: Number(e.target.value.replace(/[^\d]/g, '')) }))}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Stock</label>
            <input
              type="text"
              inputMode="numeric"
              className={field}
              value={formatNumber(form.stock_quantity)}
              onChange={(e) => setForm((f) => ({ ...f, stock_quantity: Number(e.target.value.replace(/[^\d]/g, '')) }))}
            />
          </div>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-700">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Active</span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand-600"
            checked={form.active === 1}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked ? 1 : 0 }))}
          />
        </label>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Description</label>
          <textarea
            className={field}
            rows={3}
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional details"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          {isEdit ? (
            <button
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
            onClick={save}
            disabled={saving || uploading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {isEdit ? 'Save changes' : 'Create reward'}
          </button>
        </div>
      </div>
    </div>
  )
}

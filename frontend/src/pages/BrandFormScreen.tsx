import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, Check, Store } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { MergeIntoCard } from '@/components/MergeIntoCard'
import { deleteErrorMessage } from '@/lib/format'
import { SearchableSelect } from '@/components/SearchableSelect'
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
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function BrandFormScreen() {
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
  const { data: companies } = useCompanies()

  const [form, setForm] = useState<{ brand_name: string; company: string }>({ brand_name: '', company: '' })

  useEffect(() => {
    if (isEdit && existing) {
      setForm({ brand_name: existing.brand_name, company: existing.company })
    }
  }, [isEdit, existing])

  // Access gate: redirect outside render (useEffect-safe pattern)
  const blocked = !boot ? false : !canManageBrands(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  if (isEdit && isLoading) {
    return (
      <DetailScreen title="Brand">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const validate = (): string | null => {
    if (!form.brand_name.trim()) return 'Brand name is required'
    if (!form.company) return 'Company is required'
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
        toast('success', isEdit ? 'Brand updated' : 'Brand created')
        navigate('/brands')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    if (isEdit) update.mutate({ name, payload: { company: form.company } }, opts)
    else create.mutate({ brand_name: form.brand_name.trim(), company: form.company }, opts)
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
    <DetailScreen title={isEdit ? 'Edit brand' : 'New brand'}>
      <div className="flex flex-col gap-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400">
          <Store className="h-6 w-6" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Brand name</label>
          <input
            className={field + (isEdit ? ' bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' : '')}
            value={form.brand_name}
            readOnly={isEdit}
            onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))}
            placeholder="e.g. Acme"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Company</label>
          <SearchableSelect
            value={form.company}
            onChange={(v) => setForm((f) => ({ ...f, company: v }))}
            options={(companies ?? []).map((c) => ({ value: c.name, label: c.company_name }))}
            placeholder="Select a company…"
          />
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isEdit ? 'Save changes' : 'Create brand'}
        </button>

        {isEdit && (
          <button
            onClick={remove}
            disabled={del.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:bg-rose-50 disabled:opacity-60 dark:bg-slate-800 dark:active:bg-rose-500/15"
          >
            {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete brand
          </button>
        )}

        {isEdit && mergeOptions.length > 0 && (
          <MergeIntoCard
            entity="brand"
            currentLabel={existing?.brand_name || name}
            options={mergeOptions}
            isPending={merge.isPending}
            onConfirm={doMerge}
          />
        )}
      </div>
    </DetailScreen>
  )
}

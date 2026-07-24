import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, Check, ImagePlus, Boxes } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
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
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

// Single image/logo upload tile — dashed dropzone, preview, remove. Both the
// business image and the logo reuse it (same generic upload endpoint).
function PickTile({ label, value, uploading, onPick, onClear }: {
  label: string
  value: string | null
  uploading: boolean
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</label>
        {value && !uploading && (
          <button type="button" onClick={onClear} className="text-xs font-medium text-rose-600">Remove</button>
        )}
      </div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-800"
      >
        {uploading ? (
          <Spinner className="h-5 w-5" />
        ) : value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus className="h-6 w-6" /> Tap to upload</span>
        )}
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onPick} />
    </div>
  )
}

export default function BusinessUnitFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
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
    logo: string | null
  }>({ business_unit_name: '', company: '', description: '', image: null, logo: null })
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        business_unit_name: existing.business_unit_name,
        company: existing.company ?? '',
        description: existing.description ?? '',
        image: existing.image ?? null,
        logo: existing.logo ?? null,
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
      <DetailScreen title="Business Unit">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const uploadTo = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setBusy: (v: boolean) => void,
    field: 'image' | 'logo',
  ) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      const url = await uploadBusinessUnitImage(f)
      setForm((s) => ({ ...s, [field]: url }))
      toast('success', 'Uploaded')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    if (!isEdit && !form.business_unit_name.trim()) {
      toast('error', 'Business unit name is required')
      return
    }
    const opts = {
      onSuccess: () => {
        toast('success', isEdit ? 'Business unit updated' : 'Business unit created')
        navigate('/business-units')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    const common = {
      company: form.company || null,
      description: (form.description ?? '').trim() || null,
      image: form.image ?? null,
      logo: form.logo ?? null,
    }
    if (isEdit) update.mutate({ name, payload: common }, opts)
    else create.mutate({ business_unit_name: form.business_unit_name.trim(), ...common }, opts)
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this business unit?', confirmLabel: 'Delete', destructive: true })))
      return
    del.mutate(name, {
      onSuccess: () => {
        toast('success', 'Business unit deleted')
        navigate('/business-units')
      },
      onError: (e) => toast('error', deleteErrorMessage(e, 'business unit')),
    })
  }

  const saving = create.isPending || update.isPending

  return (
    <DetailScreen title={isEdit ? 'Edit business unit' : 'New business unit'}>
      <div className="flex flex-col gap-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
          <Boxes className="h-6 w-6" />
        </div>

        {/* Image + logo */}
        <PickTile
          label="Business image"
          value={form.image}
          uploading={uploadingImage}
          onPick={(e) => uploadTo(e, setUploadingImage, 'image')}
          onClear={() => setForm((f) => ({ ...f, image: null }))}
        />
        <PickTile
          label="Logo"
          value={form.logo}
          uploading={uploadingLogo}
          onPick={(e) => uploadTo(e, setUploadingLogo, 'logo')}
          onClear={() => setForm((f) => ({ ...f, logo: null }))}
        />

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Business unit name</label>
          <input
            className={field + (isEdit ? ' bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' : '')}
            value={form.business_unit_name}
            readOnly={isEdit}
            onChange={(e) => setForm((f) => ({ ...f, business_unit_name: e.target.value }))}
            placeholder="e.g. Retail Division"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Company</label>
          <SearchableSelect
            value={form.company}
            onChange={(v) => setForm((f) => ({ ...f, company: v }))}
            options={(companies ?? []).map((c) => ({ value: c.name, label: c.company_name }))}
            placeholder="Select a company…"
            allowClear
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Description</label>
          <textarea
            className={field}
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional details"
          />
        </div>

        <button
          onClick={save}
          disabled={saving || uploadingImage || uploadingLogo}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isEdit ? 'Save changes' : 'Create business unit'}
        </button>

        {isEdit && (
          <button
            onClick={remove}
            disabled={del.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:bg-rose-50 disabled:opacity-60 dark:bg-slate-800 dark:active:bg-rose-500/15"
          >
            {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete business unit
          </button>
        )}
      </div>
    </DetailScreen>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, ImagePlus, X } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Segmented, Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { uploadAdImage } from '@/lib/api'
import { useSaveAd, useAd } from '@/hooks/useData'
import type { AdPayload, AdType } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

const TYPES = [
  { value: 'Sell', label: 'Jual' },
  { value: 'Buy', label: 'Beli' },
  { value: 'Rent', label: 'Sewa' },
] as const
const PERIODS = ['', 'per Hari', 'per Bulan', 'per Tahun']

const empty: AdPayload = {
  title: '', ad_type: 'Sell', description: '', price: 0, rate_period: '', location: '', contact: '', photos: [],
}

export default function PapanIklanFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const save = useSaveAd()
  const { data: existing, isLoading } = useAd(isEdit ? name : '')

  const [form, setForm] = useState<AdPayload>(empty)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEdit || !existing) return
    setForm({
      title: existing.title ?? '',
      ad_type: existing.ad_type ?? 'Sell',
      description: existing.description ?? '',
      price: existing.price ?? 0,
      rate_period: existing.rate_period ?? '',
      location: existing.location ?? '',
      contact: existing.contact ?? '',
      photos: existing.photos ?? [],
    })
  }, [isEdit, existing])

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (form.photos.length >= 5) { toast('error', 'Maksimal 5 foto'); return }
    setUploading(true)
    try {
      const url = await uploadAdImage(f)
      setForm((s) => ({ ...s, photos: [...s.photos, url] }))
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload gagal')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  const removePhoto = (url: string) => setForm((s) => ({ ...s, photos: s.photos.filter((p) => p !== url) }))

  const onSave = () => {
    if (!form.title.trim()) return toast('error', 'Judul wajib diisi')
    if (!form.contact.trim()) return toast('error', 'Kontak wajib diisi')
    const payload: AdPayload = {
      ...form,
      title: form.title.trim(),
      contact: form.contact.trim(),
      price: Number(form.price) || 0,
      rate_period: form.ad_type === 'Rent' ? form.rate_period : '',
    }
    save.mutate({ payload, name: isEdit ? name : undefined }, {
      onSuccess: (r) => { toast('success', isEdit ? 'Iklan disimpan' : 'Iklan dipasang'); navigate(`/papan-iklan/${encodeURIComponent(r.name)}`) },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  if (isEdit && isLoading) {
    return <DetailScreen title="Iklan"><Spinner className="mx-auto h-5 w-5 text-slate-400" /></DetailScreen>
  }

  return (
    <DetailScreen title={isEdit ? 'Edit iklan' : 'Pasang iklan'}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-500">Jenis</label>
          <Segmented options={TYPES.map((t) => ({ value: t.value, label: t.label }))} value={form.ad_type}
            onChange={(v: string) => setForm((f) => ({ ...f, ad_type: v as AdType }))} />
        </div>

        <input className={field} placeholder="Judul" value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />

        <div className="flex gap-3">
          <label className="flex-1 text-xs font-semibold text-stone-500">Harga (Rp) — kosongkan jika nego
            <input type="number" className={field} value={form.price || ''}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))} /></label>
          {form.ad_type === 'Rent' && (
            <label className="w-32 text-xs font-semibold text-stone-500">Periode
              <select className={field} value={form.rate_period}
                onChange={(e) => setForm((f) => ({ ...f, rate_period: e.target.value }))}>
                {PERIODS.map((p) => <option key={p} value={p}>{p || '—'}</option>)}
              </select></label>
          )}
        </div>

        <input className={field} placeholder="Lokasi (opsional)" value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
        <input className={field} placeholder="Kontak (WhatsApp/telepon)" value={form.contact}
          onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
        <textarea className={field} rows={4} placeholder="Deskripsi" value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-500">Foto (maks 5)</label>
          <div className="flex flex-wrap gap-2">
            {form.photos.map((src) => (
              <div key={src} className="relative h-20 w-20 overflow-hidden rounded-xl">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button onClick={() => removePhoto(src)} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {form.photos.length < 5 && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 dark:border-slate-600">
                {uploading ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-5 w-5" />}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        </div>

        <button onClick={onSave} disabled={save.isPending || uploading}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} {isEdit ? 'Simpan' : 'Pasang iklan'}
        </button>
      </div>
    </DetailScreen>
  )
}

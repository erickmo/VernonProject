import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Megaphone, ImagePlus, X } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Button, Field } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import { uploadAdImage } from '@/lib/api'
import { useSaveAd, useAd } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import type { AdPayload, AdType } from '@/lib/types'

const cls = 'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink bg-hover/[0.04] focus:border-brand-600 focus:outline-none'
const TYPES: { value: AdType; label: string }[] = [
  { value: 'Sell', label: 'Jual' }, { value: 'Buy', label: 'Beli' }, { value: 'Rent', label: 'Sewa' },
]
const PERIODS = ['', 'per Hari', 'per Bulan', 'per Tahun']
const empty: AdPayload = { title: '', ad_type: 'Sell', description: '', price: 0, rate_period: '', location: '', contact: '', photos: [] }

export default function PapanIklanForm() {
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
      title: existing.title ?? '', ad_type: existing.ad_type ?? 'Sell', description: existing.description ?? '',
      price: existing.price ?? 0, rate_period: existing.rate_period ?? '', location: existing.location ?? '',
      contact: existing.contact ?? '', photos: existing.photos ?? [],
    })
  }, [isEdit, existing])

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    if (form.photos.length >= 5) { toast('error', 'Maksimal 5 foto'); return }
    setUploading(true)
    try { const url = await uploadAdImage(f); setForm((s) => ({ ...s, photos: [...s.photos, url] })) }
    catch (err) { toast('error', err instanceof Error ? err.message : 'Upload gagal') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const onSave = () => {
    if (!form.title.trim()) return toast('error', 'Judul wajib')
    if (!form.contact.trim()) return toast('error', 'Kontak wajib')
    const payload: AdPayload = { ...form, title: form.title.trim(), contact: form.contact.trim(), price: Number(form.price) || 0, rate_period: form.ad_type === 'Rent' ? form.rate_period : '' }
    save.mutate({ payload, name: isEdit ? name : undefined }, {
      onSuccess: (r) => { toast('success', isEdit ? 'Disimpan' : 'Dipasang'); navigate(`/papan-iklan/${encodeURIComponent(r.name)}`) },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  if (isEdit && isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>

  return (
    <Page>
      <PageHeader icon={Megaphone} title={isEdit ? 'Edit iklan' : 'Pasang iklan'} />
      <div className="max-w-2xl space-y-4">
        <Field label="Jenis">{() => (
          <div className="flex gap-2">
            {TYPES.map((t) => (
              <button key={t.value} type="button" onClick={() => setForm((f) => ({ ...f, ad_type: t.value }))}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${form.ad_type === t.value ? 'bg-brand-600 text-white' : 'bg-hover/[0.05] text-muted'}`}>{t.label}</button>
            ))}
          </div>
        )}</Field>
        <Field label="Judul" required>{(id) => <input id={id} className={cls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />}</Field>
        <div className="flex gap-3">
          <Field label="Harga (Rp) — kosong = nego">{(id) => <input id={id} type="number" className={cls} value={form.price || ''} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))} />}</Field>
          {form.ad_type === 'Rent' && (
            <Field label="Periode">{(id) => (
              <select id={id} className={cls} value={form.rate_period} onChange={(e) => setForm((f) => ({ ...f, rate_period: e.target.value }))}>
                {PERIODS.map((p) => <option key={p} value={p}>{p || '—'}</option>)}
              </select>
            )}</Field>
          )}
        </div>
        <Field label="Lokasi">{(id) => <input id={id} className={cls} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />}</Field>
        <Field label="Kontak (WhatsApp/telepon)" required>{(id) => <input id={id} className={cls} value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />}</Field>
        <Field label="Deskripsi">{(id) => <textarea id={id} className={cls} rows={5} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}</Field>
        <Field label="Foto (maks 5)">{() => (
          <div className="flex flex-wrap gap-2">
            {form.photos.map((s) => (
              <div key={s} className="relative h-24 w-24 overflow-hidden rounded-xl">
                <img src={s} alt="" className="h-full w-full object-cover" />
                <button onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((p) => p !== s) }))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {form.photos.length < 5 && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-line text-muted">
                {uploading ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-5 w-5" />}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
          </div>
        )}</Field>
        <Button variant="primary" onClick={onSave} disabled={save.isPending || uploading}>{isEdit ? 'Simpan' : 'Pasang iklan'}</Button>
      </div>
    </Page>
  )
}

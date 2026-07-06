import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Tag, ShoppingCart, KeyRound, ImagePlus, X, MapPin, Phone, ArrowRight, Check } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { uploadAdImage } from '@/lib/api'
import { useSaveAd, useAd } from '@/hooks/useData'
import type { AdPayload, AdType } from '@/lib/types'

// Type cards reuse the board's per-type hues (emerald/sky/amber) so the form
// and the ad list read as one system.
const TYPES = [
  {
    value: 'Sell' as const, label: 'Jual', hint: 'Saya menjual', icon: Tag,
    sel: 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-emerald-300 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/40',
    dot: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300',
  },
  {
    value: 'Buy' as const, label: 'Beli', hint: 'Saya mencari', icon: ShoppingCart,
    sel: 'border-sky-400 bg-sky-50 text-sky-700 ring-sky-300 dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/40',
    dot: 'bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300',
  },
  {
    value: 'Rent' as const, label: 'Sewa', hint: 'Disewakan', icon: KeyRound,
    sel: 'border-amber-400 bg-amber-50 text-amber-700 ring-amber-300 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/40',
    dot: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300',
  },
]
const PERIODS = ['per Hari', 'per Bulan', 'per Tahun']

const field =
  'w-full rounded-2xl border border-paper-edge bg-paper-card px-3.5 py-3 text-sm text-stone-800 placeholder:text-stone-400 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
const shell =
  'flex items-center gap-2.5 rounded-2xl border border-paper-edge bg-paper-card px-3.5 py-3 shadow-sm transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800'

const empty: AdPayload = {
  title: '', ad_type: 'Sell', description: '', price: 0, rate_period: '', location: '', contact: '', photos: [],
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[13px] font-semibold text-stone-600 dark:text-slate-300">{children}</label>
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
      <div className="flex flex-col gap-5 pb-6">
        {/* Type cards */}
        <div>
          <Label>Mau apa?</Label>
          <div className="grid grid-cols-3 gap-2.5">
            {TYPES.map((t) => {
              const active = form.ad_type === t.value
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, ad_type: t.value as AdType }))}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border py-3.5 transition active:scale-95 ${
                    active
                      ? `${t.sel} shadow-sm ring-2`
                      : 'border-paper-edge bg-paper-card text-stone-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${active ? t.dot : 'bg-stone-100 text-stone-400 dark:bg-slate-700 dark:text-slate-400'}`}>
                    <Icon className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <span className="text-sm font-bold">{t.label}</span>
                  <span className="text-[10px] font-medium opacity-70">{t.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Title */}
        <div>
          <Label>Judul</Label>
          <input className={field} placeholder="cth. iPhone 13 Pro 256GB" value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>

        {/* Price — hero */}
        <div>
          <Label>Harga</Label>
          <div className={`${shell} py-3 dark:focus-within:ring-brand-500/20`}>
            <span className="text-lg font-bold text-stone-400">Rp</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              className="w-full bg-transparent text-2xl font-extrabold tabular-nums text-stone-800 outline-none placeholder:text-stone-300 dark:text-slate-50"
              value={form.price || ''}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
            />
          </div>
          {form.ad_type === 'Rent' ? (
            <div className="mt-2.5 flex gap-2">
              {PERIODS.map((p) => {
                const on = form.rate_period === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, rate_period: on ? '' : p }))}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                      on
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'border border-paper-edge bg-paper-card text-stone-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-stone-400">Kosongkan jika nego</p>
          )}
        </div>

        {/* Location */}
        <div>
          <Label>Lokasi <span className="font-normal text-stone-400">· opsional</span></Label>
          <div className={shell}>
            <MapPin className="h-4 w-4 shrink-0 text-brand-500" />
            <input
              className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400 dark:text-slate-100"
              placeholder="cth. Jakarta Selatan"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>
        </div>

        {/* Contact */}
        <div>
          <Label>Kontak</Label>
          <div className={shell}>
            <Phone className="h-4 w-4 shrink-0 text-brand-500" />
            <input
              className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400 dark:text-slate-100"
              placeholder="WhatsApp / telepon — 0811 2233 4455"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <Label>Deskripsi <span className="font-normal text-stone-400">· opsional</span></Label>
          <textarea className={`${field} resize-none`} rows={4} placeholder="Kondisi, kelengkapan, alasan jual…"
            value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>

        {/* Photos — first = cover */}
        <div>
          <Label>Foto</Label>
          <div className="flex flex-wrap gap-2.5">
            {form.photos.map((src, i) => (
              <div key={src} className="relative h-24 w-24 overflow-hidden rounded-2xl border border-paper-edge shadow-sm dark:border-slate-700">
                <img src={src} alt="" className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Sampul</span>
                )}
                <button type="button" onClick={() => removePhoto(src)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white active:scale-90"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {form.photos.length < 5 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-stone-300 bg-paper-card text-stone-400 transition active:scale-95 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800"
              >
                {uploading ? <Spinner className="h-5 w-5" /> : (<><ImagePlus className="h-5 w-5" /><span className="text-[10px] font-semibold">Tambah</span></>)}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-stone-400">{form.photos.length}/5 · foto pertama jadi sampul</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        </div>

        {/* Sticky save */}
        <div className="sticky bottom-4 z-10 pt-1">
          <button
            onClick={onSave}
            disabled={save.isPending || uploading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-4 text-base font-bold text-white shadow-lg shadow-brand-600/25 transition active:scale-[0.98] disabled:opacity-60"
          >
            {save.isPending ? <Spinner className="h-5 w-5" /> : (
              <>
                {isEdit && <Check className="h-5 w-5" />}
                {isEdit ? 'Simpan perubahan' : 'Pasang iklan'}
                {!isEdit && <ArrowRight className="h-5 w-5" />}
              </>
            )}
          </button>
        </div>
      </div>
    </DetailScreen>
  )
}

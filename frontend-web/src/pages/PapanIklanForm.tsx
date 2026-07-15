import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Megaphone, Tag, ShoppingCart, KeyRound, ImagePlus, X, Phone, Star } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Button, Field } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import { uploadAdImage } from '@/lib/api'
import { useSaveAd, useAd } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import type { AdPayload, AdType } from '@/lib/types'

// One field look across the whole ad flow — app-standard inset, uniform text-sm.
const cls =
  'w-full rounded-xl border border-line bg-paper-line/40 px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-brand-500 focus:bg-surface focus:ring-4 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-800/60'
const shell =
  'flex items-center gap-2 rounded-xl border border-line bg-paper-line/40 px-3 py-2.5 transition focus-within:border-brand-500 focus-within:bg-surface focus-within:ring-4 focus-within:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-800/60'

// Type cards reuse the board's per-type hues so form and list read as one system.
const TYPES = [
  { value: 'Sell' as const, label: 'Jual', hint: 'Saya menjual', icon: Tag, ic: 'text-emerald-600', sel: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300' },
  { value: 'Buy' as const, label: 'Beli', hint: 'Saya mencari', icon: ShoppingCart, ic: 'text-sky-600', sel: 'border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300' },
  { value: 'Rent' as const, label: 'Sewa', hint: 'Disewakan', icon: KeyRound, ic: 'text-amber-600', sel: 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300' },
]
const PERIODS = ['per Hari', 'per Bulan', 'per Tahun']
const empty: AdPayload = { title: '', ad_type: 'Sell', description: '', price: 0, rate_period: '', contact: '', photos: [] }

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
      price: existing.price ?? 0, rate_period: existing.rate_period ?? '',
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
      <div className="max-w-2xl space-y-5">
        {/* Type cards */}
        <Field label="Jenis">{() => (
          <div className="grid grid-cols-3 gap-2.5">
            {TYPES.map((t) => {
              const active = form.ad_type === t.value
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, ad_type: t.value as AdType }))}
                  className={`flex flex-col items-center gap-1 rounded-xl border py-3 transition active:scale-95 ${active ? `${t.sel} shadow-sm` : 'border-line bg-hover/[0.02] text-muted hover:bg-hover/[0.05]'}`}
                >
                  <Icon className={`h-5 w-5 ${active ? t.ic : 'text-muted'}`} />
                  <span className="text-sm font-semibold">{t.label}</span>
                  <span className="text-[11px] opacity-70">{t.hint}</span>
                </button>
              )
            })}
          </div>
        )}</Field>

        <Field label="Judul" required>{(id) => (
          <>
            <input id={id} maxLength={80} className={cls} placeholder="cth. iPhone 13 Pro 256GB" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <div className="mt-1 text-right text-[11px] tabular-nums text-muted">{form.title.length}/80</div>
          </>
        )}</Field>

        {/* Price — hero */}
        <Field label="Harga (Rp)">{(id) => (
          <>
            <div className={shell}>
              <span className="text-sm font-semibold text-muted">Rp</span>
              <input id={id} type="number" placeholder="0" className="w-full bg-transparent text-sm font-semibold tabular-nums text-ink outline-none placeholder:text-muted" value={form.price || ''} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))} />
            </div>
            {form.ad_type === 'Rent' ? (
              <div className="mt-2 flex gap-2">
                {PERIODS.map((p) => {
                  const on = form.rate_period === p
                  return (
                    <button key={p} type="button" onClick={() => setForm((f) => ({ ...f, rate_period: on ? '' : p }))}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition active:scale-95 ${on ? 'bg-brand-600 text-white' : 'border border-line text-muted hover:bg-hover/[0.05]'}`}>{p}</button>
                  )
                })}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">Kosongkan jika nego</p>
            )}
          </>
        )}</Field>

        <Field label="Kontak (WhatsApp/telepon)" required>{(id) => (
          <div className={shell}>
            <Phone className="h-4 w-4 shrink-0 text-muted" />
            <input id={id} className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" placeholder="0811 2233 4455" value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
          </div>
        )}</Field>

        <Field label="Deskripsi">{(id) => (
          <>
            <textarea id={id} maxLength={1000} className={`${cls} resize-none`} rows={5} placeholder="Kondisi, kelengkapan, alasan jual…" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <div className="mt-1 text-right text-[11px] tabular-nums text-muted">{form.description.length}/1000</div>
          </>
        )}</Field>

        {/* Photos — first = cover */}
        <Field label="Foto (maks 5)">{() => (
          <>
            <div className="flex flex-wrap gap-2.5">
              {form.photos.map((s, i) => (
                <div key={s} className="group relative h-24 w-24 overflow-hidden rounded-xl border border-line">
                  <img src={s} alt="" className="h-full w-full object-cover" />
                  {i === 0 ? (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      <Star className="h-2.5 w-2.5 fill-current" /> Sampul
                    </span>
                  ) : (
                    <button
                      type="button"
                      title="Jadikan sampul"
                      onClick={() => setForm((f) => { const p = [...f.photos]; const [x] = p.splice(i, 1); return { ...f, photos: [x, ...p] } })}
                      className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 py-1 text-[9px] font-semibold text-white opacity-0 transition group-hover:opacity-100"
                    >
                      <Star className="h-2.5 w-2.5" /> Jadikan sampul
                    </button>
                  )}
                  <button type="button" onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((p) => p !== s) }))} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"><X className="h-3 w-3" /></button>
                </div>
              ))}
              {form.photos.length < 5 && (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-muted transition hover:bg-hover/[0.04] disabled:opacity-60">
                  {uploading ? <Spinner className="h-5 w-5" /> : (<><ImagePlus className="h-5 w-5" /><span className="text-[10px] font-semibold">Tambah</span></>)}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
            </div>
            <p className="mt-1.5 text-xs text-muted">{form.photos.length}/5 · foto pertama jadi sampul</p>
          </>
        )}</Field>

        <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-line bg-surface/90 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
          <Button variant="ghost" onClick={() => navigate(-1)}>Batal</Button>
          <Button variant="primary" onClick={onSave} disabled={save.isPending || uploading}>
            {save.isPending ? <Spinner className="h-4 w-4" /> : null}
            {isEdit ? 'Simpan' : 'Pasang iklan'}
          </Button>
        </div>
      </div>
    </Page>
  )
}

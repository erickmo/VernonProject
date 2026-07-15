import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { Megaphone, MessageCircle, Trash2, CheckCircle2, RotateCcw, ShieldX, Ban } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Button, Field } from '@web/components/ui'
import { DatePicker } from '@web/components/DatePicker'
import CommentThread from '@/components/CommentThread'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useAd, useSetAdStatus, useDeleteAd, useAdminRemoveAd, useBanUser } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import type { AdDetail } from '@/lib/types'

function price(a: AdDetail) {
  if (!a.price) return 'Nego'
  const rp = `Rp ${a.price.toLocaleString('id-ID')}`
  return a.rate_period ? `${rp} ${a.rate_period}` : rp
}
const waLink = (c: string) => `https://wa.me/${c.replace(/[^0-9]/g, '')}`
// Match the ad form's field look so create/view/edit read as one system.
const fieldCls =
  'w-full rounded-xl border border-line bg-paper-line/40 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand-500 focus:bg-surface focus:ring-4 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-800/60'
const TYPE_LABEL: Record<AdDetail['ad_type'], string> = { Sell: 'Jual', Buy: 'Beli', Rent: 'Sewa' }
const TYPE_TINT: Record<AdDetail['ad_type'], string> = {
  Sell: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200',
  Buy: 'bg-sky-100 text-sky-700 dark:bg-sky-500/25 dark:text-sky-200',
  Rent: 'bg-violet-100 text-violet-700 dark:bg-violet-500/25 dark:text-violet-200',
}

export default function PapanIklanDetail() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const { data: ad, isLoading } = useAd(name)
  const setStatus = useSetAdStatus()
  const del = useDeleteAd()
  const adminRemove = useAdminRemoveAd()
  const ban = useBanUser()
  const [banUntil, setBanUntil] = useState('')
  const [banReason, setBanReason] = useState('')
  const [banOpen, setBanOpen] = useState(false)
  const [activePhoto, setActivePhoto] = useState(0)

  if (isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>
  if (!ad) return <Page><PageHeader icon={Megaphone} title="Iklan tidak ditemukan" /><p className="text-muted">Iklan ini mungkin sudah dihapus. <button onClick={() => navigate('/papan-iklan')} className="text-brand-600 underline">Kembali ke Papan Iklan</button></p></Page>

  const toggleFulfilled = () => setStatus.mutate(
    { name, status: ad.status === 'Fulfilled' ? 'Active' : 'Fulfilled' },
    { onSuccess: () => toast('success', 'Status diperbarui'), onError: (e) => toast('error', (e as Error).message) },
  )
  const remove = async () => {
    if (!(await confirm({ title: 'Hapus iklan ini?', confirmLabel: 'Hapus', destructive: true }))) return
    del.mutate(name, {
      onSuccess: () => { toast('success', 'Iklan dihapus'); navigate('/papan-iklan') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }
  const takedown = async () => {
    if (!(await confirm({ title: 'Turunkan iklan ini?', confirmLabel: 'Turunkan', destructive: true }))) return
    adminRemove.mutate({ name, reason: 'Melanggar aturan.' }, {
      onSuccess: () => { toast('success', 'Iklan diturunkan'); navigate('/papan-iklan') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }
  const submitBan = () => {
    if (!banUntil) return toast('error', 'Pilih tanggal')
    if (!banReason.trim()) return toast('error', 'Alasan wajib')
    ban.mutate({ user: ad.author, banned_until: banUntil, reason: banReason.trim() }, {
      onSuccess: () => { toast('success', 'Pengguna dibanned'); setBanOpen(false) },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <Page>
      <PageHeader icon={Megaphone} title={ad.title} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {ad.photos.length > 0 && (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-2xl bg-paper-line shadow-card dark:bg-slate-800">
                <img src={ad.photos[Math.min(activePhoto, ad.photos.length - 1)]} alt={ad.title} className="h-72 w-full object-cover sm:h-96" />
              </div>
              {ad.photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {ad.photos.map((s, i) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setActivePhoto(i)}
                      aria-label={`Foto ${i + 1}`}
                      className={clsx(
                        'h-16 w-16 shrink-0 overflow-hidden rounded-xl ring-2 transition',
                        i === activePhoto ? 'ring-brand-500' : 'ring-transparent opacity-60 hover:opacity-100',
                      )}
                    >
                      <img src={s} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_TINT[ad.ad_type]}`}>{TYPE_LABEL[ad.ad_type]}</span>
              {ad.status === 'Fulfilled' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Selesai
                </span>
              )}
            </div>
            <p className="font-display text-2xl font-bold text-brand-600 dark:text-brand-400">{price(ad)}</p>
            <div className="flex items-center gap-2 text-sm text-muted">
              {ad.author_image
                ? <img src={ad.author_image} alt="" className="h-6 w-6 rounded-full object-cover" />
                : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-paper-line text-[11px] font-semibold text-muted dark:bg-slate-800">{ad.author_name.slice(0, 1)}</span>}
              oleh {ad.author_name}
            </div>
            {ad.description && <div className="prose prose-sm max-w-none border-t border-line pt-3 text-ink" dangerouslySetInnerHTML={{ __html: ad.description }} />}
          </div>
          <div className="rounded-2xl bg-surface p-4 shadow-card sm:p-5"><CommentThread referenceDoctype="Papan Iklan" referenceName={name} /></div>
        </div>

        <div className="space-y-3">
          <a
            href={waLink(ad.contact)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition active:scale-[0.99]"
          >
            <MessageCircle className="h-4 w-4" /> Hubungi ({ad.contact})
          </a>

          {ad.is_owner && (
            <>
              <Button variant="secondary" className="w-full" onClick={() => navigate(`/papan-iklan/${encodeURIComponent(name)}/edit`)}>Edit iklan</Button>
              <Button variant="secondary" className="w-full" onClick={toggleFulfilled} disabled={setStatus.isPending}>
                {ad.status === 'Fulfilled' ? <><RotateCcw className="h-4 w-4" /> Aktifkan</> : <><CheckCircle2 className="h-4 w-4" /> Tandai selesai</>}
              </Button>
              <Button variant="danger" className="w-full" onClick={remove} disabled={del.isPending}><Trash2 className="h-4 w-4" /> Hapus</Button>
            </>
          )}
          {ad.is_admin && !ad.is_owner && (
            <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
              <p className="text-xs font-semibold text-rose-600">Admin</p>
              <Button variant="danger" className="w-full" onClick={takedown} disabled={adminRemove.isPending}><ShieldX className="h-4 w-4" /> Turunkan</Button>
              <Button variant="danger" className="w-full" onClick={() => setBanOpen((v) => !v)}><Ban className="h-4 w-4" /> Ban pengguna</Button>
              {banOpen && (
                <div className="space-y-2">
                  <Field label="Sampai tanggal">{(id) => <DatePicker id={id} className={fieldCls} value={banUntil} onChange={(v) => setBanUntil(v)} />}</Field>
                  <Field label="Alasan">{(id) => <textarea id={id} className={fieldCls} rows={2} value={banReason} onChange={(e) => setBanReason(e.target.value)} />}</Field>
                  <Button variant="danger" className="w-full" onClick={submitBan} disabled={ban.isPending}>Konfirmasi ban</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Page>
  )
}

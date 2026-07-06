import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageCircle, Trash2, CheckCircle2, RotateCcw, ShieldX, Ban } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import CommentThread from '@/components/CommentThread'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useAd, useSetAdStatus, useDeleteAd, useAdminRemoveAd, useBanUser } from '@/hooks/useData'
import type { AdDetail } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

function priceText(a: AdDetail) {
  if (!a.price) return 'Nego'
  const rp = `Rp ${a.price.toLocaleString('id-ID')}`
  return a.rate_period ? `${rp} ${a.rate_period}` : rp
}
const waLink = (contact: string) => `https://wa.me/${contact.replace(/[^0-9]/g, '')}`

export default function PapanIklanDetailScreen() {
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

  const [banOpen, setBanOpen] = useState(false)
  const [banUntil, setBanUntil] = useState('')
  const [banReason, setBanReason] = useState('')

  if (isLoading) {
    return <DetailScreen title="Iklan"><Spinner className="mx-auto h-5 w-5 text-slate-400" /></DetailScreen>
  }
  if (!ad) {
    return (
      <DetailScreen title="Iklan">
        <EmptyState icon={Ban} title="Iklan tidak ditemukan" subtitle="Iklan ini mungkin sudah dihapus." />
      </DetailScreen>
    )
  }

  const toggleFulfilled = () => {
    const next = ad.status === 'Fulfilled' ? 'Active' : 'Fulfilled'
    setStatus.mutate({ name, status: next }, {
      onSuccess: () => toast('success', next === 'Fulfilled' ? 'Ditandai selesai' : 'Diaktifkan lagi'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }
  const remove = async () => {
    if (!(await confirm({ title: 'Hapus iklan ini?', confirmLabel: 'Hapus', destructive: true }))) return
    del.mutate(name, {
      onSuccess: () => { toast('success', 'Iklan dihapus'); navigate('/papan-iklan') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }
  const adminTakedown = async () => {
    if (!(await confirm({ title: 'Turunkan iklan ini?', confirmLabel: 'Turunkan', destructive: true }))) return
    adminRemove.mutate({ name, reason: 'Melanggar aturan.' }, {
      onSuccess: () => { toast('success', 'Iklan diturunkan'); navigate('/papan-iklan') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }
  const submitBan = () => {
    if (!banUntil) return toast('error', 'Pilih tanggal berakhir')
    if (!banReason.trim()) return toast('error', 'Alasan wajib diisi')
    ban.mutate({ user: ad.author, banned_until: banUntil, reason: banReason.trim() }, {
      onSuccess: () => { toast('success', 'Pengguna dibanned'); setBanOpen(false); setBanReason(''); setBanUntil('') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <DetailScreen title="Iklan">
      <div className="flex flex-col gap-4">
        {ad.photos.length > 0 && (
          <div className="flex snap-x gap-2 overflow-x-auto">
            {ad.photos.map((src) => (
              <img key={src} src={src} alt="" className="h-56 w-72 shrink-0 snap-center rounded-2xl object-cover" />
            ))}
          </div>
        )}

        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-slate-50">{ad.title}</h2>
          <p className="text-base font-semibold text-brand-600">{priceText(ad)}</p>
          <p className="mt-1 text-xs text-stone-400">oleh {ad.author_name}</p>
        </div>

        {ad.description && (
          <div className="prose prose-sm max-w-none text-stone-700 dark:prose-invert dark:text-slate-200" dangerouslySetInnerHTML={{ __html: ad.description }} />
        )}

        <a href={waLink(ad.contact)} target="_blank" rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white active:scale-[0.99]">
          <MessageCircle className="h-4 w-4" /> Hubungi ({ad.contact})
        </a>

        {ad.is_owner && (
          <div className="flex flex-col gap-2">
            <button onClick={() => navigate(`/papan-iklan/${encodeURIComponent(name)}/edit`)}
              className="rounded-xl bg-white py-3 text-sm font-semibold text-brand-600 shadow-sm active:scale-95 dark:bg-slate-800">Edit iklan</button>
            <button onClick={toggleFulfilled} disabled={setStatus.isPending}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-stone-700 shadow-sm active:scale-95 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200">
              {ad.status === 'Fulfilled' ? <><RotateCcw className="h-4 w-4" /> Aktifkan lagi</> : <><CheckCircle2 className="h-4 w-4" /> Tandai selesai</>}
            </button>
            <button onClick={remove} disabled={del.isPending}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:scale-95 disabled:opacity-60 dark:bg-slate-800">
              <Trash2 className="h-4 w-4" /> Hapus iklan
            </button>
          </div>
        )}

        {ad.is_admin && !ad.is_owner && (
          <div className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
            <p className="text-xs font-semibold text-rose-600">Admin</p>
            <button onClick={adminTakedown} disabled={adminRemove.isPending}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-sm font-semibold text-rose-600 shadow-sm active:scale-95 disabled:opacity-60 dark:bg-slate-800">
              <ShieldX className="h-4 w-4" /> Turunkan iklan
            </button>
            <button onClick={() => setBanOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-sm font-semibold text-rose-600 shadow-sm active:scale-95 dark:bg-slate-800">
              <Ban className="h-4 w-4" /> Ban pengguna
            </button>
          </div>
        )}

        <div className="border-t border-paper-edge pt-4 dark:border-slate-700">
          <CommentThread referenceDoctype="Papan Iklan" referenceName={name} />
        </div>
      </div>

      {banOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setBanOpen(false)} />
          <div className="fixed inset-x-4 bottom-8 z-50 rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card animate-pop dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-3 text-sm font-semibold text-stone-800 dark:text-slate-100">Ban {ad.author_name} dari Papan Iklan</p>
            <label className="mb-1 block text-xs font-semibold text-stone-500">Berakhir tanggal</label>
            <input type="date" className={field} value={banUntil} onChange={(e) => setBanUntil(e.target.value)} />
            <label className="mb-1 mt-3 block text-xs font-semibold text-stone-500">Alasan</label>
            <textarea className={field} rows={2} value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Kenapa dibanned?" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setBanOpen(false)} className="flex-1 rounded-xl bg-white py-2.5 text-sm font-semibold text-stone-600 shadow-sm dark:bg-slate-700 dark:text-slate-200">Batal</button>
              <button onClick={submitBan} disabled={ban.isPending} className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Ban</button>
            </div>
          </div>
        </>
      )}
    </DetailScreen>
  )
}

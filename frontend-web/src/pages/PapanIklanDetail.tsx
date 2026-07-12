import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Megaphone, MessageCircle, Trash2, CheckCircle2, RotateCcw, ShieldX, Ban } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Button, Field } from '@web/components/ui'
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
const fieldCls = 'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

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
            <div className="flex gap-2 overflow-x-auto">
              {ad.photos.map((s) => <img key={s} src={s} alt="" className="h-64 w-80 shrink-0 rounded-2xl object-cover" />)}
            </div>
          )}
          <p className="text-lg font-semibold text-brand-600">{price(ad)}</p>
          <p className="text-xs text-muted">oleh {ad.author_name}</p>
          {ad.description && <div className="prose prose-sm max-w-none text-ink" dangerouslySetInnerHTML={{ __html: ad.description }} />}
          <div className="border-t border-line pt-4"><CommentThread referenceDoctype="Papan Iklan" referenceName={name} /></div>
        </div>

        <div className="space-y-3">
          <a
            href={waLink(ad.contact)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white"
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
            <div className="space-y-2 rounded-xl border border-rose-200 p-3">
              <p className="text-xs font-semibold text-rose-600">Admin</p>
              <Button variant="danger" className="w-full" onClick={takedown} disabled={adminRemove.isPending}><ShieldX className="h-4 w-4" /> Turunkan</Button>
              <Button variant="danger" className="w-full" onClick={() => setBanOpen((v) => !v)}><Ban className="h-4 w-4" /> Ban pengguna</Button>
              {banOpen && (
                <div className="space-y-2">
                  <Field label="Sampai tanggal">{(id) => <input id={id} type="date" className={fieldCls} value={banUntil} onChange={(e) => setBanUntil(e.target.value)} />}</Field>
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

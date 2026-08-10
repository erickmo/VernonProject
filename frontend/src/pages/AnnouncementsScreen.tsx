import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Megaphone, Trash2 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Spinner } from '@/components/ui'
import {
  useBoot,
  canManageAnnouncements,
  useAnnouncementsAdmin,
  useSaveAnnouncement,
  useDeleteAnnouncement,
} from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { formatDate } from '@/lib/format'
import type { AdminAnnouncement } from '@/lib/types'

const inputCls =
  'w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500'

const STATUS_HUE: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Scheduled: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Expired: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  Draft: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}

// Lexical compare works on ISO YYYY-MM-DD.
function statusOf(a: AdminAnnouncement, today: string): string {
  if (!a.published) return 'Draft'
  if (a.start_date > today) return 'Scheduled'
  if (a.end_date < today) return 'Expired'
  return 'Active'
}

type Draft = {
  name?: string
  message: string
  link: string
  start_date: string
  end_date: string
  published: boolean
}

const EMPTY: Draft = { message: '', link: '', start_date: '', end_date: '', published: true }

function toDraft(a: AdminAnnouncement): Draft {
  return {
    name: a.name,
    message: a.message,
    link: a.link ?? '',
    start_date: a.start_date,
    end_date: a.end_date,
    published: !!a.published,
  }
}

export default function AnnouncementsScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const { data, isLoading } = useAnnouncementsAdmin()
  const save = useSaveAnnouncement()
  const del = useDeleteAnnouncement()
  const toast = useToast()
  const confirm = useConfirm()
  const [draft, setDraft] = useState<Draft | null>(null)

  const blocked = !!boot && !canManageAnnouncements(boot)
  useEffect(() => {
    if (blocked) navigate('/me', { replace: true })
  }, [blocked, navigate])
  if (blocked) return null

  const today = new Date().toISOString().slice(0, 10)

  const saveDraft = () => {
    if (!draft || !draft.message.trim() || !draft.start_date || !draft.end_date) return
    if (draft.end_date < draft.start_date) {
      toast('error', 'End date cannot be before start date')
      return
    }
    save.mutate(
      {
        name: draft.name,
        message: draft.message.trim(),
        link: draft.link.trim() || undefined,
        start_date: draft.start_date,
        end_date: draft.end_date,
        published: draft.published ? 1 : 0,
      },
      {
        onSuccess: () => {
          toast('success', draft.name ? 'Updated' : 'Created')
          setDraft(null)
        },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save'),
      },
    )
  }

  const remove = async () => {
    if (!draft?.name) return
    const ok = await confirm({ title: 'Delete this announcement?', confirmLabel: 'Delete', destructive: true })
    if (!ok) return
    del.mutate(draft.name, {
      onSuccess: () => {
        toast('success', 'Deleted')
        setDraft(null)
      },
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not delete'),
    })
  }

  return (
    <DetailScreen title="Pengumuman">
      <button
        onClick={() => setDraft({ ...EMPTY })}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition active:scale-95"
      >
        <Plus className="h-4 w-4" />
        Pengumuman baru
      </button>

      {isLoading && !data ? (
        <FullScreenLoader />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Megaphone} title="Belum ada pengumuman" subtitle="Buat satu untuk tampil sebagai ticker di atas halaman." />
      ) : (
        <div className="space-y-2">
          {data.map((a) => {
            const st = statusOf(a, today)
            return (
              <button
                key={a.name}
                onClick={() => setDraft(toDraft(a))}
                className="w-full rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 text-left shadow-card transition active:scale-[0.99]"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="line-clamp-2 font-medium text-stone-800 dark:text-slate-100">{a.message}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_HUE[st]}`}>{st}</span>
                </div>
                <p className="text-xs text-stone-400 dark:text-slate-500">
                  {formatDate(a.start_date)} → {formatDate(a.end_date)}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {draft && (
        <Sheet title={draft.name ? 'Edit pengumuman' : 'Pengumuman baru'} onClose={() => !save.isPending && setDraft(null)}>
          <div className="space-y-3">
            <textarea className={inputCls} rows={3} placeholder="Pesan pengumuman" value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
            <input className={inputCls} placeholder="Tautan (opsional, https://… atau /…)" value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} />
            <div className="flex gap-2">
              <label className="flex-1 text-xs font-medium text-stone-500 dark:text-slate-400">
                Mulai
                <input type="date" className={`${inputCls} mt-1`} value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
              </label>
              <label className="flex-1 text-xs font-medium text-stone-500 dark:text-slate-400">
                Selesai
                <input type="date" className={`${inputCls} mt-1`} value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
              </label>
            </div>
            <label className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-600 px-3 py-2.5">
              <span className="text-sm font-medium text-stone-700 dark:text-slate-200">Tayangkan</span>
              <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />
            </label>
            <button
              disabled={!draft.message.trim() || !draft.start_date || !draft.end_date || save.isPending}
              onClick={saveDraft}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              {save.isPending ? <Spinner className="h-4 w-4" /> : 'Simpan'}
            </button>
            {draft.name && (
              <button
                onClick={remove}
                disabled={del.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 dark:border-rose-500/30 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-300 transition active:scale-95 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Hapus
              </button>
            )}
          </div>
        </Sheet>
      )}
    </DetailScreen>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative mx-auto max-h-[90vh] w-full sm:max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

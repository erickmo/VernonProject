import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, Plus, Trash2 } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Sheet } from '@web/components/Sheet'
import { Button } from '@web/components/ui'
import { DatePicker } from '@web/components/DatePicker'
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
  'w-full rounded-xl border border-line bg-hover/[0.04] px-3 py-2.5 text-sm text-ink outline-none focus:border-brand-500'

const STATUS_HUE: Record<string, string> = {
  Active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Scheduled: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Expired: 'bg-surface text-muted',
  Draft: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}

function statusOf(a: AdminAnnouncement, today: string): string {
  if (!a.published) return 'Draft'
  if (a.start_date > today) return 'Scheduled'
  if (a.end_date < today) return 'Expired'
  return 'Active'
}

function Chip({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_HUE[status] ?? 'bg-surface text-muted'}`}>
      {status}
    </span>
  )
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

export default function Announcements() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const toast = useToast()
  const confirm = useConfirm()
  const listQ = useAnnouncementsAdmin()
  const { data, isLoading } = listQ
  const save = useSaveAnnouncement()
  const del = useDeleteAnnouncement()
  const [draft, setDraft] = useState<Draft | null>(null)

  const blocked = !boot ? false : !canManageAnnouncements(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])
  if (bootLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (blocked) return null

  const rows = data ?? []
  const today = new Date().toISOString().slice(0, 10)
  const active = rows.filter((a) => statusOf(a, today) === 'Active').length

  const closeDraft = () => { if (!save.isPending) setDraft(null) }

  const saveDraft = () => {
    if (!draft || !draft.message.trim() || !draft.start_date || !draft.end_date || save.isPending) return
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
    if (!draft?.name || del.isPending) return
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
    <Page>
      <PageHeader icon={Megaphone} title="Pengumuman" />

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="indigo" title="Kelola">
          <div className="mt-1 flex flex-col gap-3">
            <p className="text-sm text-muted">Ticker di atas setiap halaman (/m &amp; /w).</p>
            <Button variant="primary" size="sm" onClick={() => setDraft({ ...EMPTY })}>
              <Plus className="h-4 w-4" /> Pengumuman baru
            </Button>
          </div>
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="indigo">
          <BentoStat value={active} label={active === 1 ? 'tayang' : 'tayang'} delta={`${rows.length} total`} />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {isLoading && !data ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : listQ.isError ? (
            <ErrorState onRetry={() => listQ.refetch()} />
          ) : (
            <DataTable
              rows={rows}
              columns={[
                {
                  key: 'message',
                  header: 'Pesan',
                  sortValue: (a) => a.message,
                  render: (a) => (
                    <span className="line-clamp-2 font-medium text-ink">{a.message}</span>
                  ),
                },
                {
                  key: 'period',
                  header: 'Periode',
                  render: (a) => (
                    <span className="whitespace-nowrap text-muted">
                      {formatDate(a.start_date)} → {formatDate(a.end_date)}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  align: 'right',
                  render: (a) => <Chip status={statusOf(a, today)} />,
                },
              ]}
              getKey={(a) => a.name}
              onRowClick={(a) => setDraft(toDraft(a))}
              empty={<EmptyState icon={Megaphone} title="Belum ada pengumuman" subtitle="Buat satu untuk tampil sebagai ticker di atas halaman." />}
            />
          )}
        </BentoTile>
      </BentoGrid>

      <Sheet open={!!draft} onClose={closeDraft} title={draft?.name ? 'Edit pengumuman' : 'Pengumuman baru'} size="sm">
        {draft && (
          <form onSubmit={(e) => { e.preventDefault(); saveDraft() }} className="space-y-3">
            <textarea className={`${inputCls} resize-none`} rows={3} autoFocus placeholder="Pesan pengumuman" value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
            <input className={inputCls} placeholder="Tautan (opsional, https://… atau /…)" value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} />
            <div className="flex gap-2">
              <label className="flex-1 text-xs font-medium text-muted">
                Mulai
                <DatePicker className={`${inputCls} mt-1`} value={draft.start_date} onChange={(v) => setDraft({ ...draft, start_date: v })} />
              </label>
              <label className="flex-1 text-xs font-medium text-muted">
                Selesai
                <DatePicker className={`${inputCls} mt-1`} value={draft.end_date} onChange={(v) => setDraft({ ...draft, end_date: v })} />
              </label>
            </div>
            <label className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
              <span className="text-sm font-medium text-ink">Tayangkan</span>
              <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />
            </label>
            <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
              {draft.name ? (
                <Button variant="ghost" onClick={remove} disabled={del.isPending} className="text-rose-600 dark:text-rose-300">
                  <Trash2 className="h-4 w-4" /> Hapus
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={closeDraft} disabled={save.isPending}>Batal</Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!draft.message.trim() || !draft.start_date || !draft.end_date || save.isPending}
                >
                  {save.isPending ? <Spinner className="h-4 w-4" /> : 'Simpan'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Sheet>
    </Page>
  )
}

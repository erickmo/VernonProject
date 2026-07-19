import { useState } from 'react'
import { Users, NotebookPen, Trash2, Share2, Lock, Plus } from 'lucide-react'
import { Avatar, Spinner } from '@/components/ui'
import { DatePicker } from '@web/components/DatePicker'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { formatDate } from '@/lib/format'
import type { LeaderNote } from '@/lib/types'
import {
  useUserNotes,
  useUserLeaders,
  useAddUserNote,
  useDeleteUserNote,
} from '@/hooks/useData'

// Person→person supervision. A user's leaders are DERIVED: the project_leader
// of every active (Ongoing) project the user is a team member of. Those leaders
// (and admins) record a timeline of dated-or-global notes about the user.
// Rendered on the /w user edit page. Contract: api/leader_notes.py.

const card = 'rounded-2xl bg-surface p-4 shadow-card'
const field =
  'mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

export default function LeaderNotesSection({ user }: { user: string }) {
  const confirm = useConfirm()
  const toast = useToast()

  const view = useUserNotes(user)
  const canAdd = !!view.data?.can_add

  // Only fetch derived leaders once we know the viewer may see this user (the
  // notes view loaded without a 403); a stranger never gets here.
  const leadersQ = useUserLeaders(view.data ? user : '')

  const addNote = useAddUserNote()
  const delNote = useDeleteUserNote()

  const [body, setBody] = useState('')
  const [noteDate, setNoteDate] = useState('')
  const [shared, setShared] = useState(false)

  async function onAdd() {
    const b = body.trim()
    if (!b) return
    try {
      await addNote.mutateAsync({
        user,
        body: b,
        note_date: noteDate || null,
        shared_with_user: shared ? 1 : 0,
      })
      setBody('')
      setNoteDate('')
      setShared(false)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Gagal menambah catatan')
    }
  }

  async function onDelete(n: LeaderNote) {
    const ok = await confirm({
      title: 'Hapus catatan?',
      message: 'Catatan ini akan dihapus permanen dan tidak bisa dikembalikan.',
      confirmLabel: 'Hapus',
      cancelLabel: 'Batal',
    })
    if (!ok) return
    try {
      await delNote.mutateAsync({ name: n.name, user })
      toast('success', 'Catatan dihapus')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Gagal menghapus catatan')
    }
  }

  if (view.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }
  // Hide entirely if the viewer isn't allowed to see this user's notes.
  if (view.isError || !view.data) return null

  const notes = view.data.notes
  // Nothing to add and nothing shared → don't render an empty block.
  if (!canAdd && notes.length === 0) return null

  const leaders = leadersQ.data ?? []
  const globalNotes = notes.filter((n) => !n.note_date)
  const datedKeys = [...new Set(notes.filter((n) => n.note_date).map((n) => n.note_date as string))].sort(
    (a, b) => b.localeCompare(a),
  )

  return (
    <div className="space-y-4">
      {/* Leaders — derived from active-project leadership, read-only. */}
      {leaders.length > 0 && (
        <section className={card}>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-muted" />
            <h2 className="font-semibold text-ink">Pemimpin</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {leaders.map((l) => (
              <span
                key={l.leader}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-hover/[0.04] py-1 pl-1 pr-3 text-sm text-ink"
              >
                <Avatar name={l.leader_name} image={l.user_image} size={24} />
                <span className="truncate">{l.leader_name}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Notes timeline. */}
      <section className={card}>
        <div className="mb-3 flex items-center gap-2">
          <NotebookPen className="h-4 w-4 text-muted" />
          <h2 className="font-semibold text-ink">Catatan</h2>
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-muted">Belum ada catatan.</p>
        ) : (
          <div className="space-y-5">
            {globalNotes.length > 0 && (
              <NoteGroup label="Catatan Umum" items={globalNotes} onDelete={onDelete} pending={delNote.isPending} />
            )}
            {datedKeys.map((d) => (
              <NoteGroup
                key={d}
                label={formatDate(d)}
                items={notes.filter((n) => n.note_date === d)}
                onDelete={onDelete}
                pending={delNote.isPending}
              />
            ))}
          </div>
        )}
      </section>

      {/* Add-note form — leaders + admin only. */}
      {canAdd && (
        <section className={card}>
          <div className="mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted" />
            <h2 className="font-semibold text-ink">Tambah Catatan</h2>
          </div>
          <div className="space-y-3">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Tulis catatan…"
              className={field}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-xs font-semibold text-muted">Tanggal (opsional)</span>
                <DatePicker
                  value={noteDate}
                  onChange={setNoteDate}
                  placeholder="Tanpa tanggal (umum)"
                  className={field}
                />
              </div>
              <label className="flex items-center justify-between self-end rounded-xl border border-line px-3 py-2.5">
                <span className="text-sm text-ink">Bagikan ke pengguna</span>
                <input
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => setShared(e.target.checked)}
                  className="h-5 w-5 accent-brand-600"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={onAdd}
              disabled={!body.trim() || addNote.isPending}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {addNote.isPending ? 'Menyimpan…' : 'Tambah Catatan'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function NoteGroup({
  label,
  items,
  onDelete,
  pending,
}: {
  label: string
  items: LeaderNote[]
  onDelete: (n: LeaderNote) => void
  pending: boolean
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</h3>
      <div className="space-y-2">
        {items.map((n) => (
          <div key={n.name} className="rounded-xl border border-line bg-hover/[0.03] p-3">
            <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar name={n.author_name} image={n.author_image} size={24} />
                <span className="truncate text-xs text-muted">{n.author_name}</span>
                {n.shared_with_user === 1 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.7rem] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <Share2 className="h-3 w-3" /> Dibagikan
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[0.7rem] font-medium text-muted dark:bg-white/[0.06]">
                    <Lock className="h-3 w-3" /> Privat
                  </span>
                )}
              </div>
              {n.can_delete && (
                <button
                  type="button"
                  onClick={() => onDelete(n)}
                  disabled={pending}
                  className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"
                  aria-label="Hapus catatan"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StickyNote, Trash2, Share2, Lock, Plus, FolderKanban } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { useUserNotes, useAddUserNote, useDeleteUserNote } from '@/hooks/useData'
import type { LeaderNote } from '@/lib/types'

const card =
  'rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-800 dark:border-slate-700'
const heading =
  'mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'

// note_date is 'YYYY-MM-DD'. Append time so it parses at local midnight, not UTC.
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// `project` set (member overlay) ⇒ notes scoped to it + add-form tags new notes
// with it. Omitted (user profile) ⇒ all notes about the user, read-only, each
// showing a link to its project.
export function LeaderNotesSection({ user, project }: { user: string; project?: string }) {
  const { data: view } = useUserNotes(user, project)
  if (!view) return null

  const notes = view.notes
  const canAdd = !!project && view.can_add
  // Nothing to show and nothing to add → render nothing at all.
  if (!canAdd && notes.length === 0) return null

  const showProject = !project // project chip only useful on the cross-project profile view
  const global = notes.filter((n) => !n.note_date)
  const dated = notes.filter((n) => n.note_date)
  const byDate = new Map<string, LeaderNote[]>()
  for (const n of dated) {
    const list = byDate.get(n.note_date as string) ?? []
    list.push(n)
    byDate.set(n.note_date as string, list)
  }
  // ISO dates sort lexically = chronologically; reverse → newest date first.
  const dateKeys = [...byDate.keys()].sort().reverse()

  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <p className={heading}>
          <StickyNote className="h-3.5 w-3.5" /> Catatan
        </p>
        {notes.length === 0 ? (
          <p className="text-sm italic text-slate-400 dark:text-slate-500">Belum ada catatan</p>
        ) : (
          <div className="flex flex-col gap-4">
            {global.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Catatan Umum</p>
                {global.map((n) => (
                  <NoteCard key={n.name} note={n} user={user} showProject={showProject} />
                ))}
              </div>
            )}
            {dateKeys.map((k) => (
              <div key={k} className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{fmtDate(k)}</p>
                {byDate.get(k)!.map((n) => (
                  <NoteCard key={n.name} note={n} user={user} showProject={showProject} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {canAdd && <AddNoteForm user={user} project={project!} />}
    </div>
  )
}

function ProjectChip({ note }: { note: LeaderNote }) {
  const navigate = useNavigate()
  if (!note.project) return null
  return (
    <button
      onClick={() => navigate(`/project/${encodeURIComponent(note.project as string)}`)}
      className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 active:scale-95 dark:bg-brand-500/15 dark:text-brand-300"
    >
      <FolderKanban className="h-3 w-3" /> {note.project_title || note.project}
    </button>
  )
}

function NoteCard({ note, user, showProject }: { note: LeaderNote; user: string; showProject: boolean }) {
  const confirm = useConfirm()
  const toast = useToast()
  const del = useDeleteUserNote()

  async function onDelete() {
    const ok = await confirm({
      title: 'Hapus catatan?',
      message: 'Catatan ini akan dihapus permanen.',
      confirmLabel: 'Hapus',
      destructive: true,
    })
    if (!ok) return
    del.mutate(
      { name: note.name, user },
      {
        onSuccess: () => toast('success', 'Catatan dihapus'),
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menghapus'),
      },
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-paper p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{note.body}</p>
      {showProject && note.project && (
        <div className="mt-2">
          <ProjectChip note={note} />
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Avatar name={note.author_name} image={note.author_image} size={22} />
        <span className="flex-1 truncate text-xs text-slate-500 dark:text-slate-400">{note.author_name}</span>
        {note.shared_with_user === 1 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <Share2 className="h-3 w-3" /> Dibagikan
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            <Lock className="h-3 w-3" /> Privat
          </span>
        )}
        {note.can_delete && (
          <button
            onClick={onDelete}
            disabled={del.isPending}
            aria-label="Hapus catatan"
            className="rounded-full p-1 text-rose-500 active:bg-rose-50 disabled:opacity-50 dark:active:bg-rose-500/15"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function AddNoteForm({ user, project }: { user: string; project: string }) {
  const toast = useToast()
  const add = useAddUserNote()
  const [body, setBody] = useState('')
  const [date, setDate] = useState('')
  const [shared, setShared] = useState(false)

  function submit() {
    const b = body.trim()
    if (!b) return
    add.mutate(
      { user, project, body: b, note_date: date || null, shared_with_user: shared ? 1 : 0 },
      {
        onSuccess: () => {
          setBody('')
          setDate('')
          setShared(false)
          toast('success', 'Catatan ditambahkan')
        },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menambah catatan'),
      },
    )
  }

  return (
    <div className={card}>
      <p className={heading}>
        <Plus className="h-3.5 w-3.5" /> Tambah Catatan
      </p>
      <div className="flex flex-col gap-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Tulis catatan…"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
        />
        <label className="block">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tanggal (kosongkan untuk catatan umum)</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </label>
        <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:bg-slate-800 dark:border-slate-700">
          <span className="text-sm text-slate-700 dark:text-slate-200">Bagikan ke pengguna</span>
          <input
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
            className="h-5 w-5 accent-brand-600"
          />
        </label>
        <button
          onClick={submit}
          disabled={add.isPending || !body.trim()}
          className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
        >
          {add.isPending ? 'Menyimpan…' : 'Tambah Catatan'}
        </button>
      </div>
    </div>
  )
}

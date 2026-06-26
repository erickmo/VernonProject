import { useNavigate } from 'react-router-dom'
import { CheckSquare, Plus, StickyNote } from 'lucide-react'
import { TabScreen, PullToRefresh } from '@/components/Layout'
import { Avatar, EmptyState, FullScreenLoader } from '@/components/ui'
import { usePersonalNotes } from '@/hooks/useData'
import type { PersonalNote } from '@/lib/types'

function NoteCard({ note }: { note: PersonalNote }) {
  const navigate = useNavigate()
  const total = note.items.length
  const done = note.items.filter((i) => i.checked).length
  const preview = (note.body || '').trim()
  return (
    <button
      onClick={() => navigate(`/notes/${encodeURIComponent(note.name)}`)}
      className="flex w-full flex-col gap-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-left shadow-sm transition active:scale-[0.99]"
    >
      <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-slate-50">
        {note.title?.trim() || 'Untitled'}
      </p>
      {preview && (
        <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{preview}</p>
      )}
      <div className="mt-0.5 flex items-center gap-3">
        {total > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 dark:text-slate-500">
            <CheckSquare className="h-3.5 w-3.5" /> {done}/{total}
          </span>
        )}
        {!note.is_owner && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Avatar name={note.owner_name} size={18} /> {note.owner_name}
          </span>
        )}
      </div>
    </button>
  )
}

export default function NotesScreen() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = usePersonalNotes()

  const owned = data?.owned ?? []
  const shared = data?.shared ?? []
  const bothEmpty = owned.length === 0 && shared.length === 0

  const addButton = (
    <button
      onClick={() => navigate('/notes/new')}
      aria-label="New note"
      className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 transition active:scale-90 active:bg-slate-200/60 dark:active:bg-slate-700"
    >
      <Plus className="h-6 w-6" />
    </button>
  )

  return (
    <TabScreen title="Notes" subtitle={`${owned.length + shared.length} notes`} right={addButton}>
      {isLoading && !data ? (
        <FullScreenLoader label="Loading notes…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {bothEmpty ? (
            <EmptyState
              icon={StickyNote}
              title="No notes yet"
              subtitle="Tap + to jot down a quick note or checklist."
            />
          ) : (
            <div className="flex flex-col gap-5">
              {owned.length > 0 && (
                <div>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="h-5 w-1.5 rounded-full bg-brand-600" />
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">My Notes</h3>
                    <span className="rounded-full bg-brand-100 dark:bg-brand-500/20 px-2 py-0.5 text-xs font-bold text-brand-700 dark:text-brand-300">
                      {owned.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {owned.map((n) => (
                      <NoteCard key={n.name} note={n} />
                    ))}
                  </div>
                </div>
              )}

              {shared.length > 0 && (
                <div>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="h-5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Shared with me</h3>
                    <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                      {shared.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {shared.map((n) => (
                      <NoteCard key={n.name} note={n} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </PullToRefresh>
      )}
    </TabScreen>
  )
}

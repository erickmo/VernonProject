import { useNavigate } from 'react-router-dom'
import { CheckSquare, Plus, StickyNote } from 'lucide-react'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { usePersonalNotes } from '@/hooks/useData'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import type { PersonalNote } from '@/lib/types'

function NoteCard({ note }: { note: PersonalNote }) {
  const navigate = useNavigate()
  const total = note.items.length
  const done = note.items.filter((i) => i.checked).length
  const preview = (note.body || '').trim()
  return (
    <button
      type="button"
      onClick={() => navigate(`/notes/${encodeURIComponent(note.name)}`)}
      className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 text-left hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-hover/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition"
    >
      <p className="truncate font-semibold text-ink">
        {note.title?.trim() || 'Untitled'}
      </p>
      {preview && <p className="line-clamp-3 text-sm text-muted">{preview}</p>}
      <div className="mt-0.5 flex items-center gap-3">
        {total > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
            <CheckSquare className="h-3.5 w-3.5" /> {done}/{total}
          </span>
        )}
        {!note.is_owner && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Avatar name={note.owner_name} size={18} /> {note.owner_name}
          </span>
        )}
      </div>
    </button>
  )
}

export default function Notes() {
  const navigate = useNavigate()
  const notesQuery = usePersonalNotes()
  const { data, isLoading } = notesQuery

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }
  if (notesQuery.isError) {
    return <ErrorState onRetry={() => notesQuery.refetch()} />
  }

  const owned = data?.owned ?? []
  const shared = data?.shared ?? []
  const bothEmpty = owned.length === 0 && shared.length === 0

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Notes</h1>

      <BentoGrid>
        <BentoTile
          span="sm"
          tone="tint"
          accent="brand"
          actions={
            <button
              onClick={() => navigate('/notes/new')}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> New note
            </button>
          }
        >
          <BentoStat value={owned.length + shared.length} label="notes" />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {bothEmpty ? (
            <div className="flex flex-col items-center gap-3">
              <EmptyState
                icon={StickyNote}
                title="No notes yet"
                subtitle="Jot down a quick note or checklist."
              />
              <button
                onClick={() => navigate('/notes/new')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <Plus className="h-4 w-4" /> New note
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {owned.length > 0 && (
                <section>
                  <h2 className="mb-2.5 text-sm font-semibold uppercase tracking-wide text-muted">
                    My notes
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {owned.map((n) => (
                      <NoteCard key={n.name} note={n} />
                    ))}
                  </div>
                </section>
              )}
              {shared.length > 0 && (
                <section>
                  <h2 className="mb-2.5 text-sm font-semibold uppercase tracking-wide text-muted">
                    Shared with me
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {shared.map((n) => (
                      <NoteCard key={n.name} note={n} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}

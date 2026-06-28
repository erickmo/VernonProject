import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, FolderKanban, ListChecks, Send, X } from 'lucide-react'
import { CreateProjectItemSheet } from '@/components/CreateProjectItemSheet'
import { EmptyState, Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { mobileApi } from '@/lib/api'
import { keys, useProject, useProjectDetail, useProjects } from '@/hooks/useData'

export type QuickAddMode = 'task' | 'note'

// Remember the last project the user added a todo to, so a second FAB tap jumps
// straight to its work-item step instead of the project list again. Survives
// sheet close + reload + both mount points (Today + Projects).
const LAST_PROJECT_KEY = 'vernon.fab.lastProject'
const readLastProject = (): string | null => {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY)
  } catch {
    return null
  }
}

export function QuickAddSheet({
  open,
  mode,
  onClose,
}: {
  open: boolean
  mode: QuickAddMode
  onClose: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const { data: projects } = useProjects()
  // Init from the remembered project so a repeat tap reopens to its work items.
  const [project, setProjectState] = useState<string | null>(() => readLastProject())
  const [detail, setDetail] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  // Both queries are gated by their `enabled: !!name` — passing '' is a no-op.
  const { data: projectFull, isLoading: projLoading, isError: projError } = useProject(project ?? '')
  const { data: detailData, isLoading: detailLoading } = useProjectDetail(detail ?? '')

  // Persist (or clear) the chosen project so it survives close + reload.
  const chooseProject = (name: string | null) => {
    setProjectState(name)
    try {
      if (name) localStorage.setItem(LAST_PROJECT_KEY, name)
      else localStorage.removeItem(LAST_PROJECT_KEY)
    } catch {
      /* storage disabled — in-memory only */
    }
  }

  // A remembered project the user can no longer open (left it / it was deleted)
  // → drop it and fall back to the project list.
  useEffect(() => {
    if (project && projError) chooseProject(null)
  }, [project, projError])

  // On close, KEEP the chosen project (next tap reopens to its work items) and
  // only clear the within-project transient choices.
  useEffect(() => {
    if (!open) {
      setDetail(null)
      setText('')
      setSaving(false)
    }
  }, [open])

  if (!open) return null

  // ----- Note mode: single-field Personal Note capture -----
  if (mode === 'note') {
    const saveNote = async () => {
      const body = text.trim()
      if (!body) return
      setSaving(true)
      try {
        const res = await mobileApi.createPersonalNote('', body, [])
        if (res.status !== 'ok') throw new Error(res.message || 'Could not save note')
        qc.invalidateQueries({ queryKey: keys.personalNotes })
        toast('success', 'Note saved')
        onClose()
      } catch (e) {
        toast('error', e instanceof Error ? e.message : 'Could not save note')
      } finally {
        setSaving(false)
      }
    }
    return (
      <SheetShell title="Quick note" onClose={onClose}>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Jot something down…"
          rows={4}
          className="w-full rounded-2xl border border-paper-edge bg-paper px-3 py-2.5 text-[16px] text-stone-700 outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
        />
        <button
          onClick={saveNote}
          disabled={saving || !text.trim()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          Save note
        </button>
      </SheetShell>
    )
  }

  // ----- Task mode, final step: hand off to the real create form -----
  if (detail) {
    if (detailLoading || !detailData) {
      return (
        <SheetShell title="New todo" onClose={onClose}>
          <div className="flex justify-center py-8">
            <Spinner className="h-5 w-5 text-stone-400" />
          </div>
        </SheetShell>
      )
    }
    return (
      <CreateProjectItemSheet
        open
        onClose={onClose}
        projectDetail={detail}
        team={detailData.team}
        defaultGroup={detailData.default_group}
        siblings={detailData.project_items.map((t) => ({ name: t.name, to_do: t.to_do }))}
      />
    )
  }

  // ----- Task mode, step 2: pick a work item within the project -----
  if (project) {
    const details = projectFull?.project_details ?? []
    return (
      <SheetShell title="Pick a work item" onClose={onClose} onBack={() => chooseProject(null)}>
        {projLoading && !projectFull ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-5 w-5 text-stone-400" />
          </div>
        ) : details.length ? (
          <div className="flex flex-col gap-2">
            {details.map((d) => (
              <button
                key={d.name}
                onClick={() => setDetail(d.name)}
                className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card px-4 py-3 text-left active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800"
              >
                <ListChecks className="h-5 w-5 shrink-0 text-brand-500" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-700 dark:text-slate-100">
                  {d.title}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ListChecks}
            title="No work items"
            subtitle="This project has no work items to add a todo to yet."
          />
        )}
      </SheetShell>
    )
  }

  // ----- Task mode, step 1: pick a project you own or manage -----
  // Only projects you own / lead / admin — the ones you add work to.
  const ownedManaged = (projects ?? []).filter((p) => p.is_owner || p.is_leader || p.is_admin)
  return (
    <SheetShell title="Pick a project" onClose={onClose}>
      {ownedManaged.length ? (
        <div className="flex flex-col gap-2">
          {ownedManaged.map((p) => (
            <button
              key={p.name}
              onClick={() => chooseProject(p.name)}
              className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card px-4 py-3 text-left active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800"
            >
              <FolderKanban className="h-5 w-5 shrink-0 text-brand-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-stone-700 dark:text-slate-100">
                  {p.project_name}
                </span>
                {p.brand && (
                  <span className="block truncate text-xs text-stone-400 dark:text-slate-500">{p.brand}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FolderKanban}
          title="No projects to add to"
          subtitle="You can add todos to projects you own or manage."
        />
      )}
    </SheetShell>
  )
}

// Bottom-sheet chrome shared by every QuickAddSheet step. Mirrors RedeemSheet:
// tap-scrim-to-close, rounded-top panel, drag handle, safe-area bottom padding.
function SheetShell({
  title,
  children,
  onClose,
  onBack,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  onBack?: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative mx-auto max-h-[80vh] w-full max-w-[448px] overflow-y-auto rounded-t-3xl bg-paper-card p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-paper-line dark:bg-slate-600" />
        <div className="mb-4 flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back"
              className="rounded-full p-1 text-stone-400 active:scale-90 dark:text-slate-500"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <h2 className="flex-1 font-display text-lg font-semibold text-stone-800 dark:text-slate-50">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-stone-400 active:scale-90 dark:text-slate-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

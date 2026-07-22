import { useCallback, useRef, useState } from 'react'
import type { ProjectItem } from '@/lib/types'
import {
  TodoMenuContextProvider,
  useTodoMenuGroups,
  type TodoMenuItem,
} from '@/hooks/useTodoMenu'
import { CreateMeetingSheet } from './CreateMeetingSheet'
import { FocusNoteSheet } from './FocusNoteSheet'

// Mobile provider for the shared todo context menu (long-press on /m). Renders the
// grouped model from useTodoMenuGroups as a bottom action-sheet and hosts the two
// platform-specific overlays (Add Meeting, Focus note). Mounted once in App.tsx.
export function TodoContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<ProjectItem | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const targetRef = useRef<ProjectItem | null>(null)

  const [meetingOpen, setMeetingOpen] = useState(false)
  const [meetingProject, setMeetingProject] = useState<string | undefined>()
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState<{ todoId: string; title: string } | null>(null)

  const closeMenu = () => {
    setMenuOpen(false)
    setTarget(null)
  }

  const groups = useTodoMenuGroups(target, {
    onAddMeeting: () => {
      const t = targetRef.current
      setMeetingProject(t?.project)
      closeMenu()
      setMeetingOpen(true)
    },
    onAddFocusNote: () => {
      const t = targetRef.current
      setNote(t ? { todoId: t.name, title: t.to_do } : null)
      closeMenu()
      setNoteOpen(true)
    },
  })

  // mobile ignores the `at` coords (the sheet is always bottom-anchored)
  const open = useCallback((t: ProjectItem) => {
    setTarget(t)
    targetRef.current = t
    setMenuOpen(true)
  }, [])

  const run = (it: TodoMenuItem) => {
    it.onClick()
    closeMenu()
  }

  return (
    <TodoMenuContextProvider value={{ open }}>
      {children}

      {menuOpen && groups.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 animate-fade-in" onClick={closeMenu}>
          <div
            className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 px-3 pb-6 pt-2 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
            {groups.map((g) => (
              <div key={g.key} className="mb-1">
                <p className="truncate px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-400">
                  {g.label}
                </p>
                {g.items.map((it) => (
                  <button
                    key={it.key}
                    onClick={() => run(it)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-700 dark:text-slate-100 active:scale-[0.98] active:bg-slate-100 dark:active:bg-slate-700"
                  >
                    {/* ponytail: spec said h-4.5 but this tailwind config has no 4.5 in the spacing scale (would render 24px); h-5 is the nearest valid, matches the sheet icon convention */}
                    <it.icon className="h-5 w-5 shrink-0 text-slate-400" />
                    {it.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <CreateMeetingSheet open={meetingOpen} onClose={() => setMeetingOpen(false)} project={meetingProject} />
      <FocusNoteSheet
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        todoId={note?.todoId ?? ''}
        title={note?.title ?? ''}
      />
    </TodoMenuContextProvider>
  )
}

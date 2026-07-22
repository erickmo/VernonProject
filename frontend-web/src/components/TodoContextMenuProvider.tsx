import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import type { ProjectItem } from '@/lib/types'
import {
  TodoMenuContextProvider,
  useTodoMenuGroups,
  type TodoMenuItem,
} from '@/hooks/useTodoMenu'
import { CreateMeetingDialog } from '@web/components/CreateMeetingDialog'
import { FocusNoteDialog } from '@web/components/FocusNoteDialog'

// Desktop (/w) mount of the shared todo context menu: a cursor-anchored popover
// with a fly-out submenu per group. Action wiring is shared (useTodoMenuGroups);
// only this presentation + the two in-place overlays are web-specific.

const MENU_W = 240 // matches w-60
const SUB_W = 224 // matches w-56

export function TodoContextMenuProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ProjectItem | null>(null)
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const targetRef = useRef<ProjectItem | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Overlays (platform-specific, opened from the shared menu model).
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [meetingProject, setMeetingProject] = useState<string | undefined>(undefined)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState<{ todoId: string; title: string } | null>(null)

  const closeMenu = () => {
    setCoords(null)
    setTarget(null)
    setHovered(null)
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

  const open = useCallback((t: ProjectItem, at?: { x: number; y: number }) => {
    setTarget(t)
    targetRef.current = t
    setHovered(null)
    setCoords(at ?? { x: 0, y: 0 })
  }, [])

  // Outside-click + Escape close, bound only while the menu is open.
  useEffect(() => {
    if (!coords) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      closeMenu()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [coords])

  const run = (it: TodoMenuItem) => {
    it.onClick()
    closeMenu()
  }

  // Clamp to viewport, then decide which side the fly-out opens toward.
  let popup = null
  if (coords) {
    const estH = groups.length * 40 + 12
    let x = coords.x
    let y = coords.y
    if (x + MENU_W > window.innerWidth) x = Math.max(8, x - MENU_W)
    if (y + estH > window.innerHeight) y = Math.max(8, window.innerHeight - estH - 8)
    const flipSub = x + MENU_W + SUB_W > window.innerWidth

    popup = createPortal(
      <div
        ref={menuRef}
        role="menu"
        style={{ left: x, top: y }}
        className="fixed z-[60] w-60 origin-top-left animate-pop rounded-xl border border-line bg-surface py-1 text-ink shadow-card"
      >
        {groups.map((g) => (
          <div
            key={g.key}
            className="relative"
            onMouseEnter={() => setHovered(g.key)}
          >
            <button
              role="menuitem"
              tabIndex={0}
              onFocus={() => setHovered(g.key)}
              onClick={() => setHovered((h) => (h === g.key ? null : g.key))}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-hover/[0.04] focus:bg-hover/[0.04] focus:outline-none"
            >
              <span className="truncate">{g.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
            </button>
            {hovered === g.key && (
              <div
                className={`absolute top-0 w-56 animate-fade-in rounded-xl border border-line bg-surface py-1 shadow-card ${
                  flipSub ? 'right-full mr-1' : 'left-full ml-1'
                }`}
              >
                {g.items.map((it) => (
                  <button
                    key={it.key}
                    role="menuitem"
                    onClick={() => run(it)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-ink hover:bg-hover/[0.04]"
                  >
                    <it.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{it.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>,
      document.body,
    )
  }

  return (
    <TodoMenuContextProvider value={{ open }}>
      {children}
      {popup}
      <CreateMeetingDialog
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        project={meetingProject}
      />
      <FocusNoteDialog
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        todoId={note?.todoId ?? ''}
        title={note?.title ?? ''}
      />
    </TodoMenuContextProvider>
  )
}

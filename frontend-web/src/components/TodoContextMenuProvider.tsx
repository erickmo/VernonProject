import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import type { ProjectItem } from '@/lib/types'
import { flipSubmenu, placeCursorMenu, shiftIntoView } from '@/lib/menuPlacement'
import {
  TodoMenuContextProvider,
  useTodoMenuGroups,
  type TodoMenuItem,
} from '@/hooks/useTodoMenu'
import { CreateMeetingDialog } from '@web/components/CreateMeetingDialog'
import { FocusNoteDialog } from '@web/components/FocusNoteDialog'
import { MoveTodosDialog } from '@web/components/MoveTodosDialog'

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
  const subRef = useRef<HTMLDivElement>(null)
  // px the open fly-out is lifted by so its bottom stays on screen (0 = fits).
  const [subShift, setSubShift] = useState(0)

  // Overlays (platform-specific, opened from the shared menu model).
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [meetingProject, setMeetingProject] = useState<string | undefined>(undefined)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState<{ todoId: string; title: string } | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveSeed, setMoveSeed] = useState<ProjectItem | null>(null)

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
    onMove: () => {
      const t = targetRef.current
      setMoveSeed(t)
      closeMenu()
      setMoveOpen(true)
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
    // The menu is anchored to a cursor POINT in viewport coords, so once the page
    // scrolls that point no longer marks the card it was opened on — it just hangs
    // there. Close, like every native context menu. Capture phase so a scrolling
    // container counts too; scrolling inside the menu itself does not.
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return
      closeMenu()
    }
    // A resize (window, zoom, mobile URL bar, rotation) only changes the CLAMP, so
    // re-place instead of closing: same coords, fresh render.
    const onResize = () => setCoords((c) => (c ? { ...c } : c))
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [coords])

  // The fly-out opens level with its group row, so a row low in the viewport puts
  // its items off the bottom edge. Measure both and lift. offsetHeight ignores the
  // transform we apply and the row's rect ignores its child's, so this settles in
  // one pass — no measure/apply loop.
  useLayoutEffect(() => {
    const el = subRef.current
    const row = el?.parentElement
    if (!el || !row) {
      setSubShift(0)
      return
    }
    setSubShift(shiftIntoView(row.getBoundingClientRect().top, el.offsetHeight, window.innerHeight))
  }, [hovered, coords])

  const run = (it: TodoMenuItem) => {
    it.onClick()
    closeMenu()
  }

  // Clamp to viewport, then decide which side the fly-out opens toward.
  let popup = null
  if (coords) {
    // Rows are a fixed height and truncate rather than wrap, so this over-estimates
    // by a few px per group — the safe direction. No overflow-y here on purpose: a
    // scroll container would clip the absolutely-positioned fly-outs.
    const estH = groups.length * 40 + 12
    const { left: x, top: y } = placeCursorMenu(coords, window.innerWidth, window.innerHeight, MENU_W, estH)
    const flipSub = flipSubmenu(x, MENU_W, SUB_W, window.innerWidth)

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
                ref={subRef}
                style={{ transform: `translateY(${subShift}px)` }}
                className={`absolute top-0 max-h-[calc(100vh-16px)] w-56 overflow-y-auto animate-fade-in rounded-xl border border-line bg-surface py-1 shadow-card ${
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
      <MoveTodosDialog open={moveOpen} onClose={() => setMoveOpen(false)} seed={moveSeed} />
    </TodoMenuContextProvider>
  )
}

import { createContext, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderOpen,
  Pencil,
  CalendarPlus,
  ListTree,
  ExternalLink,
  Play,
  StickyNote,
  CalendarCheck,
  Copy,
  type LucideIcon,
} from 'lucide-react'
import type { ProjectItem } from '@/lib/types'
import { useFocusPill } from '@/hooks/useFocusPill'
import { useSetTodoAllocations } from '@/hooks/useData'
import { buildNext } from '@/lib/planDay'
import { todayISO } from '@/lib/format'

// Shared contract for the todo context menu (right-click on /w, long-press on /m).
// Lives in shared frontend/src so the shared TodoCard imports ONE hook that works in
// both builds; each frontend mounts its own provider (bottom-sheet vs cursor popover)
// exposing this same context. Action wiring below is fully shared — only the menu's
// presentation and the two in-place overlays (Add Meeting, Focus note) differ per platform.

export type TodoMenuTarget = ProjectItem

export interface TodoMenuItem {
  key: string
  label: string
  icon: LucideIcon
  onClick: () => void
}
export interface TodoMenuGroup {
  key: 'project' | 'detail' | 'todo'
  label: string
  items: TodoMenuItem[]
}

// Trigger → provider. `at` carries the cursor for the web popover; the mobile sheet ignores it.
export interface TodoMenuContextValue {
  open: (target: TodoMenuTarget, at?: { x: number; y: number }) => void
}
const TodoMenuContext = createContext<TodoMenuContextValue | null>(null)
export const TodoMenuContextProvider = TodoMenuContext.Provider

// Returns null when no provider is mounted, so a trigger can safely no-op.
export function useTodoContextMenu(): TodoMenuContextValue | null {
  return useContext(TodoMenuContext)
}

// Dummy target so the per-todo hooks below are always called unconditionally (Rules of
// Hooks) even before the first menu is opened. An empty name yields no focus timer and a
// harmless allocation key.
const EMPTY = { name: '', to_do: '', estimated: 0, today_allocation: 0, allocations: [] } as unknown as ProjectItem

// Builds the grouped menu model for a target. Same in both frontends. The provider injects
// the two overlay-openers (Add Meeting, Add focus note) since those overlays are
// platform-specific (sheet vs dialog); everything else is navigation / shared hooks.
export function useTodoMenuGroups(
  target: TodoMenuTarget | null,
  overlays: { onAddMeeting: () => void; onAddFocusNote: () => void },
): TodoMenuGroup[] {
  const navigate = useNavigate()
  const t = target ?? EMPTY
  const { onFocusPill } = useFocusPill(t)
  const setAlloc = useSetTodoAllocations(t.name)

  if (!target) return []

  const planned = t.today_allocation > 0
  const toggleToday = () => {
    if (setAlloc.isPending) return
    const minutes = planned ? 0 : t.estimated > 0 ? t.estimated : 30
    setAlloc.mutate(buildNext(t.allocations ?? [], todayISO(), minutes))
  }
  const go = (path: string) => () => navigate(path)
  const item = encodeURIComponent(t.name)

  const groups: TodoMenuGroup[] = []

  if (t.project) {
    groups.push({
      key: 'project',
      label: t.project_name || 'Project Group',
      items: [
        { key: 'p-open', label: 'Open', icon: FolderOpen, onClick: go(`/project/${encodeURIComponent(t.project)}`) },
        { key: 'p-edit', label: 'Edit', icon: Pencil, onClick: go(`/project/${encodeURIComponent(t.project)}?edit=1`) },
        { key: 'p-meeting', label: 'Add Meeting', icon: CalendarPlus, onClick: overlays.onAddMeeting },
      ],
    })
  }

  if (t.project_detail) {
    groups.push({
      key: 'detail',
      label: t.project_detail_title || 'Project Detail',
      items: [
        { key: 'd-open', label: 'Open', icon: ListTree, onClick: go(`/project-detail/${encodeURIComponent(t.project_detail)}`) },
        // The detail-edit form lives on the project page on both platforms.
        { key: 'd-edit', label: 'Edit', icon: Pencil, onClick: go(`/project/${encodeURIComponent(t.project)}?editDetail=${encodeURIComponent(t.project_detail)}`) },
      ],
    })
  }

  groups.push({
    key: 'todo',
    label: t.to_do || 'Todo',
    items: [
      { key: 't-open', label: 'Open', icon: ExternalLink, onClick: go(`/project-item/${item}`) },
      { key: 't-edit', label: 'Edit', icon: Pencil, onClick: go(`/project-item/${item}?edit=1`) },
      { key: 't-focus', label: 'Focus', icon: Play, onClick: () => onFocusPill() },
      { key: 't-note', label: 'Add focus note', icon: StickyNote, onClick: overlays.onAddFocusNote },
      // Only the assignee sets the day-plan (backend enforces it too).
      ...(t.is_mine ? [{ key: 't-today', label: planned ? 'Remove from Today' : 'Add to Today', icon: CalendarCheck, onClick: toggleToday }] : []),
      { key: 't-duplicate', label: 'Duplicate', icon: Copy, onClick: go(`/project-item/${item}?duplicate=1`) },
    ],
  })

  return groups
}

import { useFocusTimer } from '@/hooks/useFocusTimer'
import { useFocusMode } from '@/hooks/useData'
import { useConfirm } from '@/components/Confirm'
import { openFocusOverlay } from '@/lib/focusUI'
import { formatEstimate } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

// Shared behaviour for the inline "Focus / Focusing" pill on todo cards + rows.
// Not focusing → start. Focusing + fullscreen mode → open the overlay (its own
// stop lives there). Focusing + inline mode → confirm, then stop — the overlay
// never opens in inline mode, so this is the pill's only stop path.
export function useFocusPill(todo: ProjectItem) {
  const focus = useFocusTimer(todo.name)
  const focusMode = useFocusMode()
  const confirm = useConfirm()
  const focusActive = focus.timer != null

  const onFocusPill = async (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.()
    if (!focusActive) {
      focus.start(todo.name, todo.to_do, todo.estimated, {
        project: todo.project_name,
        deadlineHuman: todo.deadline_human || undefined,
        overdue: todo.is_overdue,
        estimateLabel: todo.estimated > 0 ? formatEstimate(todo.estimated) : undefined,
      })
      if (focusMode === 'fullscreen') openFocusOverlay(todo.name)
      return
    }
    if (focusMode === 'fullscreen') {
      openFocusOverlay(todo.name)
      return
    }
    if (
      await confirm({
        title: 'Stop focus timer?',
        message: todo.to_do,
        confirmLabel: 'Stop',
        cancelLabel: 'Keep going',
        destructive: true,
      })
    )
      focus.stop()
  }

  return { focus, focusActive, focusMode, onFocusPill }
}

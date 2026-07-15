import { useNavigate } from 'react-router-dom'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { useProjectItem } from '@/hooks/useData'
import { useAdvance } from '@/components/AdvanceProvider'
import { useFocusOverlay, closeFocusOverlay } from '@/lib/focusUI'
import { FocusOverlay } from '@web/components/FocusOverlay'

// The single global web focus overlay, driven by the shared focusUI store.
// Reads the open task's timer + meta and feeds the presentational FocusOverlay.
export function FocusHost() {
  const { open, taskId } = useFocusOverlay()
  const focus = useFocusTimer(taskId ?? '')
  const navigate = useNavigate()
  const advanceConfirm = useAdvance()
  // Current status/auth for the open task; enabled: !!name → no fetch while closed.
  const { data: todo } = useProjectItem(taskId ?? '')
  if (!open || !focus.timer) return null
  const name = focus.timer.taskId
  return (
    <FocusOverlay
      title={focus.timer.taskTitle}
      meta={focus.timer.meta}
      displayMs={focus.hasEstimate ? focus.remainingMs : focus.elapsedMs}
      fraction={focus.fraction}
      stopwatch={!focus.hasEstimate}
      paused={focus.timer.status === 'paused'}
      onPause={focus.pause}
      onResume={focus.resume}
      onReset={focus.reset}
      onStop={() => {
        focus.stop()
        closeFocusOverlay()
      }}
      onClose={closeFocusOverlay}
      note={focus.note}
      onNote={focus.setNote}
      onOpenTodo={() => {
        closeFocusOverlay()
        navigate(`/project-item/${encodeURIComponent(name)}`)
      }}
      // "Mark done" and "Approve" are the same advance action — label + auth
      // (can_advance) come from the server per stage.
      advanceLabel={todo?.can_advance ? todo.next_status_label ?? undefined : undefined}
      onAdvance={
        todo?.next_status_label
          ? () =>
              advanceConfirm(name, todo.next_status_label!, todo.to_do, () => {
                focus.stop() // end this task's focus timer …
                closeFocusOverlay() // … and exit focus mode
              })
          : undefined
      }
    />
  )
}

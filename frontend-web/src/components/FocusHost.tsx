import { useFocusTimer } from '@/hooks/useFocusTimer'
import { useFocusOverlay, closeFocusOverlay } from '@/lib/focusUI'
import { FocusOverlay } from '@web/components/FocusOverlay'

// The single global web focus overlay, driven by the shared focusUI store.
// Reads the open task's timer + meta and feeds the presentational FocusOverlay.
export function FocusHost() {
  const { open, taskId } = useFocusOverlay()
  const focus = useFocusTimer(taskId ?? '')
  if (!open || !focus.timer) return null
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
    />
  )
}

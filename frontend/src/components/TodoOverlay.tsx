import { createPortal } from 'react-dom'
import ProjectItemScreen from '@/pages/ProjectItemScreen'

// Mirrors @web's TodoDrawer: renders the todo screen on top of the frozen background
// route (see isTodoPath in App.tsx) so the list underneath stays mounted and scrolled.
// ProjectItemScreen already supplies its own header + back button (DetailScreen), and
// its back button / hardware back both call navigate(-1), which naturally lands back
// on the background route and closes this overlay — no separate onClose needed.
// Portal to <body> so `fixed` is viewport-relative even under a transformed ancestor.
// z-40: stay below full-screen z-50 popups (Focus, DISC/prank/recognition gates).
export default function TodoOverlay() {
  return createPortal(
    <div className="fixed inset-0 z-40 animate-slide-in-right overflow-y-auto bg-paper dark:bg-slate-900">
      <ProjectItemScreen />
    </div>,
    document.body,
  )
}

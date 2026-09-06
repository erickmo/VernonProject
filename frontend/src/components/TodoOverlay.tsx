import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import clsx from 'clsx'
import ProjectItemScreen from '@/pages/ProjectItemScreen'
import { useProjectItem } from '@/hooks/useData'

// Mirrors @web's TodoDrawer: renders the todo screen on top of the frozen background
// route (see isTodoPath in App.tsx) so the list underneath stays mounted and scrolled.
// ProjectItemScreen already supplies its own header + back button (DetailScreen), and
// its back button / hardware back both call navigate(-1), which naturally lands back
// on the background route and closes this overlay — no separate onClose needed.
// Portal to <body> so `fixed` is viewport-relative even under a transformed ancestor.
// z-40: stay below full-screen z-50 popups (Focus, DISC/prank/recognition gates).
export default function TodoOverlay() {
  const { name = '' } = useParams()
  // Same queryKey as ProjectItemScreen's own useProjectItem(id) below — react-query
  // dedupes to one fetch, so reading the AI flag here for the panel tint is free.
  const { data } = useProjectItem(decodeURIComponent(name))
  const aiOn = data?.work_mode === 'AI' || data?.work_mode === 'Both'

  return createPortal(
    <div
      className={clsx(
        'fixed inset-0 z-40 animate-slide-in-right overflow-y-auto',
        aiOn ? 'bg-violet-50/40 dark:bg-violet-500/[0.06]' : 'bg-paper dark:bg-slate-900',
      )}
    >
      <ProjectItemScreen />
    </div>,
    document.body,
  )
}

import { Outlet, useMatch } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import clsx from 'clsx'
import { ProjectRail } from '@web/components/ProjectRail'

// Split-screen projects workspace: persistent project rail (left) + selected
// project view (right). On < lg the rail and the project view swap in/out so
// it stays a usable single-column master-detail.
export default function ProjectsWorkspace() {
  const onProject = !!useMatch('/project/*')
  return (
    <div className="flex min-h-[calc(100vh-9rem)] gap-5">
      <aside
        className={clsx(
          'sticky top-24 max-h-[calc(100vh-7rem)] shrink-0 self-start overflow-hidden rounded-2xl bg-surface shadow-card',
          onProject ? 'hidden lg:block lg:w-64 xl:w-72' : 'block w-full lg:w-64 xl:w-72',
        )}
      >
        <ProjectRail />
      </aside>
      <div
        className={clsx(
          'min-w-0 flex-1 rounded-2xl bg-surface p-5 shadow-card lg:p-6',
          onProject ? 'block' : 'hidden lg:block',
        )}
      >
        <Outlet />
      </div>
    </div>
  )
}

export function ProjectsIndexPrompt() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center text-muted">
      <FolderKanban className="h-10 w-10 opacity-40" />
      <p className="text-sm">Select a project from the list to view its details.</p>
    </div>
  )
}

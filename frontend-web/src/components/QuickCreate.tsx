import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckSquare, StickyNote, FolderKanban } from 'lucide-react'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'
import { ProjectFormDialog } from '@web/components/ProjectFormDialog'
import { useModalA11y } from '@web/lib/useModalA11y'

export function QuickCreate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const { name } = useParams()
  const [task, setTask] = useState(false)
  const [project, setProject] = useState(false)
  const ref = useModalA11y(open, onClose)

  if (!open && !task && !project) return null

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50" onClick={onClose}>
          <div
            ref={ref}
            role="menu"
            aria-label="Create new"
            tabIndex={-1}
            className="absolute right-4 top-16 w-56 rounded-lg border border-line bg-surface p-1.5 shadow-pop animate-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              role="menuitem"
              onClick={() => { onClose(); setTask(true) }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-hover/[0.04]"
            >
              <CheckSquare className="h-4 w-4 text-brand-600" /> New task
            </button>
            <button
              role="menuitem"
              onClick={() => { onClose(); nav('/notes/new') }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-hover/[0.04]"
            >
              <StickyNote className="h-4 w-4 text-brand-600" /> New note
            </button>
            <button
              role="menuitem"
              onClick={() => { onClose(); setProject(true) }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-hover/[0.04]"
            >
              <FolderKanban className="h-4 w-4 text-brand-600" /> New project
            </button>
          </div>
        </div>
      )}
      {/* ponytail: team=[] when no project-detail context; assignee picker will be empty */}
      {task && (
        <CreateProjectItemDialog
          open={task}
          onClose={() => setTask(false)}
          projectDetail={name ?? ''}
          team={[]}
        />
      )}
      {project && (
        <ProjectFormDialog
          open={project}
          onClose={() => setProject(false)}
        />
      )}
    </>
  )
}

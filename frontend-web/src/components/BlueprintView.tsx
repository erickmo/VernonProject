import { BlueprintBoard } from '@/components/BlueprintBoard'
import { ProjectDetailFormDialog } from '@web/components/ProjectDetailFormDialog'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'

// Web "Peta" — backward whiteboard for one project. Shares the mobile board
// engine; injects web quick-add Dialogs.
export function BlueprintView({ project, detailScope }: { project: string; detailScope?: string }) {
  return (
    <BlueprintBoard
      project={project}
      detailScope={detailScope}
      renderAddSubgoal={({ open, onClose, project }) => (
        <ProjectDetailFormDialog open={open} onClose={onClose} project={project} />
      )}
      renderAddTodo={({ detail, onClose }) => (
        <CreateProjectItemDialog open onClose={onClose} projectDetail={detail} />
      )}
    />
  )
}

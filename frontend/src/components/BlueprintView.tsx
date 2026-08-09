import { BlueprintBoard } from './BlueprintBoard'
import { ProjectDetailFormSheet } from './ProjectDetailFormSheet'
import { CreateProjectItemSheet } from './CreateProjectItemSheet'

// Mobile "Peta" — backward whiteboard for one project. Soft-pop quick-add Sheets.
export function BlueprintView({ project, detailScope }: { project: string; detailScope?: string }) {
  return (
    <BlueprintBoard
      project={project}
      detailScope={detailScope}
      renderAddSubgoal={({ open, onClose, project }) => (
        <ProjectDetailFormSheet open={open} onClose={onClose} project={project} />
      )}
      renderAddTodo={({ detail, onClose }) => (
        // team empty → assignee picked later on the todo; keeps quick-add lightweight.
        <CreateProjectItemSheet open onClose={onClose} projectDetail={detail} team={[]} />
      )}
    />
  )
}

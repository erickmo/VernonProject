import { useState } from 'react'
import { useProjects, useProject, useProjectDetail } from '@/hooks/useData'

/**
 * "Which project, then which detail?" -- the two questions every flow that lands
 * a todo from outside the project tree has to ask before the create form can
 * open (feedback inbox, share target). One copy, shared by both frontends.
 *
 * The options are whatever the server hands back, which is already scoped to the
 * projects this user is on (`get_projects` -> `_visible_projects`); the picker
 * never widens that.
 */
export function useProjectDetailPicker() {
  const [project, setProject] = useState('')
  const [detail, setDetail] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const projects = useProjects()
  const projectDoc = useProject(project)
  const detailDoc = useProjectDetail(detail)

  return {
    project,
    detail,
    dialogOpen,
    // Changing project invalidates the chosen detail (details are project-scoped).
    chooseProject: (p: string) => {
      setProject(p)
      setDetail('')
    },
    chooseDetail: (d: string) => setDetail(d),
    openDialog: () => setDialogOpen(true),
    /** Back to the picker, keeping the choice — closing the form is not cancelling. */
    closeDialog: () => setDialogOpen(false),
    reset: () => {
      setProject('')
      setDetail('')
      setDialogOpen(false)
    },
    projectCards: projects.data ?? [], // ProjectCard[] — {name, project_name}
    projectDetails: projectDoc.data?.project_details ?? [], // {name, title}[]
    detailData: detailDoc.data, // {team, default_group}
  }
}

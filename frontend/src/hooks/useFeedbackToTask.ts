import { useState } from 'react'
import { useProjects, useProject, useProjectDetail, useLinkTask } from '@/hooks/useData'
import type { FeedbackItem } from '@/lib/types'

/** First line of the message, trimmed to a title-sized length. */
function firstLine(s: string, max = 140): string {
  const line = (s || '').split('\n')[0].trim()
  return line.length > max ? line.slice(0, max).trimEnd() : line
}

/**
 * Shared flow for turning a feedback item into a Project Todo.
 * Holds the project → detail picker state, prefills the todo from the feedback,
 * and on create links the todo back to the feedback (which marks it Reviewed).
 *
 * Rendering is per-platform: each inbox shows its own picker overlay + its own
 * todo dialog (CreateProjectItemDialog / CreateProjectItemSheet), wiring the
 * values below into them.
 */
export function useFeedbackToTask() {
  const [feedback, setFeedback] = useState<FeedbackItem | null>(null)
  const [project, setProject] = useState('')
  const [detail, setDetail] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const projects = useProjects()
  const projectDoc = useProject(project)
  const detailDoc = useProjectDetail(detail)
  const link = useLinkTask()

  const start = (fb: FeedbackItem) => {
    setFeedback(fb)
    setProject('')
    setDetail('')
    setDialogOpen(false)
  }
  const cancel = () => {
    setFeedback(null)
    setProject('')
    setDetail('')
    setDialogOpen(false)
  }

  // Changing project invalidates the chosen detail (details are project-scoped).
  const chooseProject = (p: string) => {
    setProject(p)
    setDetail('')
  }
  const chooseDetail = (d: string) => setDetail(d)
  const openDialog = () => setDialogOpen(true)

  const onCreated = (todoName: string) => {
    if (!feedback || !todoName) {
      cancel()
      return
    }
    link.mutate(
      { feedback: feedback.name, todo: todoName },
      { onSettled: cancel },
    )
  }

  const initial = feedback
    ? { toDo: firstLine(feedback.message), notes: feedback.message }
    : undefined

  return {
    feedback, // non-null while the flow is active
    picking: !!feedback && !dialogOpen, // show the project/detail picker
    dialogOpen, // show the todo dialog
    start,
    cancel,
    openDialog,
    project,
    chooseProject,
    detail,
    chooseDetail,
    projectCards: projects.data ?? [], // ProjectCard[] — {name, project_name}
    projectDetails: projectDoc.data?.project_details ?? [], // {name, title}[]
    detailData: detailDoc.data, // {team, default_group}
    initial, // { toDo, notes } prefill for the dialog
    onCreated,
    linking: link.isPending,
  }
}

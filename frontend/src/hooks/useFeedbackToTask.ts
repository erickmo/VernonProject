import { useState } from 'react'
import { useLinkTask } from '@/hooks/useData'
import { useProjectDetailPicker } from '@/hooks/useProjectDetailPicker'
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
  const picker = useProjectDetailPicker()
  const link = useLinkTask()

  const start = (fb: FeedbackItem) => {
    setFeedback(fb)
    picker.reset()
  }
  const cancel = () => {
    setFeedback(null)
    picker.reset()
  }

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
    picking: !!feedback && !picker.dialogOpen, // show the project/detail picker
    dialogOpen: picker.dialogOpen, // show the todo dialog
    start,
    cancel,
    openDialog: picker.openDialog,
    project: picker.project,
    chooseProject: picker.chooseProject,
    detail: picker.detail,
    chooseDetail: picker.chooseDetail,
    projectCards: picker.projectCards,
    projectDetails: picker.projectDetails,
    detailData: picker.detailData,
    initial, // { toDo, notes } prefill for the dialog
    onCreated,
    linking: link.isPending,
  }
}

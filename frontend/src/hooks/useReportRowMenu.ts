import { useEffect, useState } from 'react'
import { useTodoContextMenu } from '@/hooks/useTodoMenu'
import { useProjectItem } from '@/hooks/useData'

// Opens the shared todo context menu (right-click on /w, long-press on /m) for a
// report row. Report rows carry only `todo_id`, not a full ProjectItem, so we
// fetch the item on demand and open the menu once it arrives (instant when the
// query is already cached). Returns null when no menu provider is mounted, so the
// caller can leave rows inert. Shared by both ReportPages.
export function useReportRowMenu() {
  const menu = useTodoContextMenu()
  const [pending, setPending] = useState<{ id: string; at: { x: number; y: number } } | null>(null)
  const { data: todo } = useProjectItem(pending?.id ?? '')

  useEffect(() => {
    if (!menu || !pending || !todo || todo.name !== pending.id) return
    menu.open(todo, pending.at)
    setPending(null)
  }, [menu, pending, todo])

  if (!menu) return null
  return (id: string, at: { x: number; y: number }) => setPending({ id, at })
}

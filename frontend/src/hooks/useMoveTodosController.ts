import { useEffect, useMemo, useState } from 'react'
import type { ProjectItem } from '@/lib/types'
import { useProject, useProjectDetail, useMoveTodos } from '@/hooks/useData'
import { useToast } from '@/components/Toast'

// Shared logic for the "Move to detail…" dialog (bottom-sheet on /m, Drawer on
// /w). Fetches the seed todo's project (for destination details) and its source
// detail (for the batch checklist), holds the selection, and runs the move. The
// two frontends render this state; only presentation differs.
export function useMoveTodosController(
  seed: ProjectItem | null,
  open: boolean,
  onClose: () => void,
) {
  const toast = useToast()
  // Gated on `open` so nothing is fetched until the dialog is actually shown.
  const project = useProject(open ? seed?.project ?? '' : '')
  const sourceDetail = useProjectDetail(open ? seed?.project_detail ?? '' : '')
  const move = useMoveTodos()

  const [destination, setDestination] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  // Reset + pre-check the triggering todo each time the dialog (re)opens.
  useEffect(() => {
    if (open && seed) {
      setChecked(new Set([seed.name]))
      setDestination('')
      setQuery('')
    }
  }, [open, seed?.name])

  const destinationOptions = useMemo(
    () =>
      (project.data?.project_details ?? [])
        .filter((d) => d.name !== seed?.project_detail)
        .map((d) => ({ value: d.name, label: d.title })),
    [project.data, seed?.project_detail],
  )
  const todos = sourceDetail.data?.project_items ?? []
  const filteredTodos = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? todos.filter((t) => t.to_do.toLowerCase().includes(q)) : todos
  }, [todos, query])

  const toggle = (name: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  // Select/clear all currently-shown (filtered) todos in one tap.
  const allShownChecked = filteredTodos.length > 0 && filteredTodos.every((t) => checked.has(t.name))
  const toggleAllShown = () =>
    setChecked((prev) => {
      const next = new Set(prev)
      filteredTodos.forEach((t) => (allShownChecked ? next.delete(t.name) : next.add(t.name)))
      return next
    })

  const canSubmit = !!destination && checked.size > 0 && !move.isPending
  const submit = async () => {
    if (!canSubmit) return
    try {
      const res = await move.mutateAsync({ destination, todoIds: [...checked] })
      toast('success', `Dipindahkan (${res.moved} tugas)`)
      onClose()
    } catch (e) {
      toast('error', (e as Error).message || 'Gagal memindahkan tugas')
    }
  }

  return {
    destinationOptions,
    todos,
    filteredTodos,
    query,
    setQuery,
    destination,
    setDestination,
    checked,
    toggle,
    allShownChecked,
    toggleAllShown,
    submit,
    canSubmit,
    isPending: move.isPending,
    loading: project.isLoading || sourceDetail.isLoading,
    hasDestinations: destinationOptions.length > 0,
  }
}

import { useEffect, useMemo, useState } from 'react'
import type { ProjectItem } from '@/lib/types'
import { useProject, useProjectDetail, useMoveTodos, useMoveDestinations } from '@/hooks/useData'
import { useToast } from '@/components/Toast'

type Option = { value: string; label: string }

// Destination projects offered by the picker: the task's own project first (the
// common "another detail over here" move), then every project the server would
// accept as a cross-project destination. list_move_destinations already applies
// the server's eligibility rule (not Closed, and owned by the caller unless they
// are a System Manager), so the picker can never offer a move the server refuses.
export function buildProjectOptions(
  current: { project?: string; project_name?: string } | null,
  destinations: { name: string; project_name: string }[] | undefined,
): Option[] {
  if (!current?.project) return []
  return [
    { value: current.project, label: current.project_name || current.project },
    ...(destinations ?? [])
      .filter((p) => p.name !== current.project)
      .map((p) => ({ value: p.name, label: p.project_name })),
  ]
}

// Details of the chosen destination project. The source detail is excluded only
// when it belongs to that project — moving to a different project makes every one
// of its details a real destination.
export function buildDetailOptions(
  details: { name: string; title: string }[] | undefined,
  excludeDetail?: string,
): Option[] {
  return (details ?? [])
    .filter((d) => d.name !== excludeDetail)
    .map((d) => ({ value: d.name, label: d.title }))
}

// Shared logic for the "Pindahkan Tugas" dialog (bottom-sheet on /m, Drawer on
// /w). Holds the destination project + detail selection and the batch checklist,
// and runs the move. The two frontends render this state; only presentation
// differs.
export function useMoveTodosController(
  seed: ProjectItem | null,
  open: boolean,
  onClose: () => void,
) {
  const toast = useToast()
  const [destProject, setDestProject] = useState('')
  const [destination, setDestination] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  const targetProject = destProject || seed?.project || ''
  const isCrossProject = !!targetProject && targetProject !== seed?.project
  // Gated on `open` so nothing is fetched until the dialog is actually shown.
  // Keyed on the CHOSEN project, so picking another one loads its details.
  const project = useProject(open ? targetProject : '')
  const projectDestinations = useMoveDestinations(open ? seed?.project_detail ?? '' : '')
  const sourceDetail = useProjectDetail(open ? seed?.project_detail ?? '' : '')
  const move = useMoveTodos()

  // Reset + pre-check the triggering todo each time the dialog (re)opens.
  useEffect(() => {
    if (open && seed) {
      setChecked(new Set([seed.name]))
      setDestProject(seed.project ?? '')
      setDestination('')
      setQuery('')
    }
  }, [open, seed?.name])

  // Changing project invalidates any detail already picked from the old one.
  const chooseProject = (value: string) => {
    setDestProject(value)
    setDestination('')
  }

  const projectOptions = useMemo(
    () => buildProjectOptions(seed, projectDestinations.data),
    [seed?.project, seed?.project_name, projectDestinations.data],
  )
  const destinationOptions = useMemo(
    () => buildDetailOptions(project.data?.project_details, isCrossProject ? undefined : seed?.project_detail),
    [project.data, isCrossProject, seed?.project_detail],
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
      const where = projectOptions.find((p) => p.value === targetProject)?.label
      toast('success', `Dipindahkan (${res.moved} tugas)${where ? ` ke ${where}` : ''}`)
      onClose()
    } catch (e) {
      toast('error', (e as Error).message || 'Gagal memindahkan tugas')
    }
  }

  return {
    projectOptions,
    destProject: targetProject,
    setDestProject: chooseProject,
    isCrossProject,
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
    hasOtherProjects: projectOptions.length > 1,
  }
}

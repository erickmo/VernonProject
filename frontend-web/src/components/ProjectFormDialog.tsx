import { useEffect, useState } from 'react'
import { useFormOptions, useCreateProject, useUpdateProject, useProjects } from '@/hooks/useData'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectChips } from '@/components/MultiSelectChips'
import { useToast } from '@/components/Toast'
import { parseFrappeError } from '@/lib/format'
import { Dialog } from '@web/components/overlays/Dialog'
import type { ProjectFull, ProjectInput } from '@/lib/types'

const STATUS_OPTS = [
  { value: 'Ongoing', label: 'Ongoing' },
  { value: 'Closed', label: 'Closed' },
]

export function ProjectFormDialog({
  open,
  onClose,
  project,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  project?: ProjectFull
  onSaved?: (name: string) => void
}) {
  const { data: opts } = useFormOptions()
  const { data: allProjects } = useProjects()
  const create = useCreateProject()
  const update = useUpdateProject(project?.name ?? '')
  const toast = useToast()
  const isEdit = !!project

  const [f, setF] = useState<ProjectInput>({
    project_name: '',
    brand: '',
    project_owner: '',
    project_leader: '',
    project_admin: '',
    blocked_by: '',
    start_date: '',
    deadline: '',
    goal: '',
    status: 'Ongoing',
    team_members: [],
  })

  useEffect(() => {
    if (project) {
      setF({
        project_name: project.project_name,
        brand: project.brand,
        project_owner: project.project_owner,
        project_leader: project.project_leader,
        project_admin: project.project_admin ?? '',
        blocked_by: project.blocked_by ?? '',
        start_date: project.start_date ?? '',
        deadline: project.deadline ?? '',
        goal: project.goal ?? '',
        status: project.status,
        team_members: project.team.map((t) => ({ user: t.user })),
      })
    }
  }, [project])

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) =>
    setF((s) => ({ ...s, [k]: v }))

  const submit = () => {
    if (
      !f.project_name.trim() ||
      !f.brand ||
      !f.project_owner ||
      !f.project_leader ||
      !f.start_date ||
      !f.deadline
    ) {
      toast('error', 'Name, brand, owner, leader, start date and deadline are required')
      return
    }
    if (f.start_date > f.deadline) {
      toast('error', 'Start date cannot be after the deadline')
      return
    }
    const onDone = (r: { name: string }) => {
      toast('success', isEdit ? 'Project updated' : 'Project created')
      onSaved?.(r.name)
      onClose()
    }
    const onErr = (err: unknown) =>
      toast('error', parseFrappeError((err as Error).message))
    if (isEdit) update.mutate(f, { onSuccess: onDone, onError: onErr })
    else create.mutate(f, { onSuccess: onDone, onError: onErr })
  }

  const users = opts?.users ?? []
  const brandOpts = opts?.brands ?? []
  const busy = create.isPending || update.isPending

  const blockedByOpts = (allProjects ?? [])
    .filter((p) => p.name !== project?.name)
    .map((p) => ({ value: p.name, label: p.project_name }))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit project' : 'New project'}
      widthClass="max-w-2xl"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {isEdit ? 'Save changes' : 'Create project'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Project name — full width */}
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Project name<span className="text-red-500"> *</span>
          </span>
          <input
            value={f.project_name}
            onChange={(e) => set('project_name', e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:text-slate-100"
          />
        </label>

        {/* Brand */}
        <div className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Brand<span className="text-red-500"> *</span>
          </span>
          <SearchableSelect
            value={f.brand}
            onChange={(v) => set('brand', v)}
            options={brandOpts}
            placeholder="Select…"
          />
        </div>

        {/* Status */}
        <div className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Status</span>
          <SearchableSelect
            value={f.status}
            onChange={(v) => set('status', v)}
            options={STATUS_OPTS}
          />
        </div>

        {/* Owner */}
        <div className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Owner<span className="text-red-500"> *</span>
          </span>
          <SearchableSelect
            value={f.project_owner}
            onChange={(v) => set('project_owner', v)}
            options={users}
            placeholder="Select…"
          />
        </div>

        {/* Leader */}
        <div className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Leader<span className="text-red-500"> *</span>
          </span>
          <SearchableSelect
            value={f.project_leader}
            onChange={(v) => set('project_leader', v)}
            options={users}
            placeholder="Select…"
          />
        </div>

        {/* Admin */}
        <div className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Admin</span>
          <SearchableSelect
            value={f.project_admin ?? ''}
            onChange={(v) => set('project_admin', v)}
            options={users}
            allowClear
            placeholder="None"
          />
        </div>

        {/* Blocked by — PROJECT link, not user */}
        <div className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Blocking project
          </span>
          <SearchableSelect
            value={f.blocked_by ?? ''}
            onChange={(v) => set('blocked_by', v)}
            options={blockedByOpts}
            allowClear
            placeholder="None — not blocked"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500">
            The project this one depends on / is blocked by.
          </p>
        </div>

        {/* Start date */}
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Start<span className="text-red-500"> *</span>
          </span>
          <input
            type="date"
            value={f.start_date}
            onChange={(e) => set('start_date', e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:text-slate-100"
          />
        </label>

        {/* Deadline */}
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Deadline<span className="text-red-500"> *</span>
          </span>
          <input
            type="date"
            value={f.deadline}
            onChange={(e) => set('deadline', e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:text-slate-100"
          />
        </label>

        {/* Goal — full width */}
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Goal</span>
          <textarea
            value={f.goal ?? ''}
            onChange={(e) => set('goal', e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:text-slate-100"
          />
        </label>

        {/* Team members — full width */}
        <div className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Team</span>
          <MultiSelectChips
            options={users}
            value={(f.team_members ?? []).map((t) => t.user)}
            onChange={(vs) => set('team_members', vs.map((user) => ({ user })))}
          />
        </div>
      </div>
    </Dialog>
  )
}

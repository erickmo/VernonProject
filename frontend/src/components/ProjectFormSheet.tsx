import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { useFormOptions, useCreateProject, useUpdateProject } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { ProjectFull, ProjectInput } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  /** Present = edit mode (prefilled); absent = create mode. */
  project?: ProjectFull
  /** Edit mode: may the user reassign owner/leader? */
  canReassign?: boolean
  onSaved?: (name: string) => void
}

const STATUSES = ['Ongoing', 'Closed']

export function ProjectFormSheet({ open, onClose, project, canReassign = true, onSaved }: Props) {
  const toast = useToast()
  const isEdit = !!project
  const { data: opts } = useFormOptions()
  const create = useCreateProject()
  const update = useUpdateProject(project?.name ?? '')
  const saving = create.isPending || update.isPending

  const [f, setF] = useState<ProjectInput>({
    project_name: '', brand: '', project_owner: '', project_leader: '',
    project_admin: '', project_group: '', start_date: '', deadline: '',
    goal: '', status: 'Ongoing', team_members: [],
  })

  useEffect(() => {
    if (project) {
      setF({
        project_name: project.project_name,
        brand: project.brand,
        project_owner: project.project_owner,
        project_leader: project.project_leader,
        project_admin: project.project_admin ?? '',
        project_group: project.project_group,
        start_date: project.start_date ?? '',
        deadline: project.deadline ?? '',
        goal: project.goal ?? '',
        status: project.status,
        team_members: project.team.map((t) => ({ user: t.user })),
      })
    }
  }, [project])

  if (!open) return null

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) =>
    setF((s) => ({ ...s, [k]: v }))

  const field =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400'

  const submit = () => {
    if (!f.project_name.trim() || !f.brand || !f.project_owner || !f.project_leader ||
        !f.project_group || !f.start_date || !f.deadline) {
      toast('error', 'Name, brand, owner, leader, group, start date and deadline are required')
      return
    }
    const onDone = (r: { name: string }) => {
      toast('success', isEdit ? 'Project updated' : 'Project created')
      onSaved?.(r.name)
      onClose()
    }
    const onErr = (err: unknown) => toast('error', (err as Error).message)
    if (isEdit) update.mutate(f, { onSuccess: onDone, onError: onErr })
    else create.mutate(f, { onSuccess: onDone, onError: onErr })
  }

  const users = opts?.users ?? []
  const lockLeads = isEdit && !canReassign

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit project' : 'New project'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600">
            Project name<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={f.project_name} onChange={(e) => set('project_name', e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Brand<span className="text-red-500"> *</span>
            <SearchableSelect value={f.brand} onChange={(v) => set('brand', v)} options={opts?.brands ?? []} placeholder="Select…" />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Project group<span className="text-red-500"> *</span>
            <SearchableSelect value={f.project_group} onChange={(v) => set('project_group', v)} options={opts?.project_groups ?? []} placeholder="Select…" />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Owner<span className="text-red-500"> *</span>
            <SearchableSelect value={f.project_owner} onChange={(v) => set('project_owner', v)} options={users} disabled={lockLeads} placeholder="Select…" />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Leader<span className="text-red-500"> *</span>
            <SearchableSelect value={f.project_leader} onChange={(v) => set('project_leader', v)} options={users} disabled={lockLeads} placeholder="Select…" />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Admin
            <SearchableSelect value={f.project_admin ?? ''} onChange={(v) => set('project_admin', v)} options={users} allowClear placeholder="None" />
          </label>

          <div className="flex gap-3">
            <label className="flex-1 text-sm font-medium text-slate-600">
              Start<span className="text-red-500"> *</span>
              <input type="date" className={field + ' mt-1'} value={f.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </label>
            <label className="flex-1 text-sm font-medium text-slate-600">
              Deadline<span className="text-red-500"> *</span>
              <input type="date" className={field + ' mt-1'} value={f.deadline} onChange={(e) => set('deadline', e.target.value)} />
            </label>
          </div>

          <label className="text-sm font-medium text-slate-600">
            Status
            <SearchableSelect value={f.status} onChange={(v) => set('status', v)} options={STATUSES.map((s) => ({ value: s, label: s }))} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Goal
            <textarea className={field + ' mt-1'} rows={2} value={f.goal} onChange={(e) => set('goal', e.target.value)} />
          </label>

          <button onClick={submit} disabled={saving}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {isEdit ? 'Save changes' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}

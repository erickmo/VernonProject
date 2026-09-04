import { useEffect, useState } from 'react'
import { useFormOptions, useCreateProject, useUpdateProject, useProjects } from '@/hooks/useData'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { useToast } from '@/components/Toast'
import { parseFrappeError } from '@/lib/format'
import { Drawer } from '@web/components/overlays/Drawer'
import { Button } from '@web/components/ui'
import { DatePicker } from '@web/components/DatePicker'
import type { ProjectFull, ProjectInput } from '@/lib/types'

const STATUS_OPTS = [
  { value: 'Ongoing', label: 'Ongoing' },
  { value: 'Closed', label: 'Closed' },
  { value: 'Inbox', label: 'Inbox' },
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
    project_admins: [],
    blocked_by: '',
    start_date: '',
    deadline: '',
    goal: '',
    success_condition: '',
    failure_condition: '',
    context: '',
    status: 'Ongoing',
    reward_type: 'Rupiah',
    bonus_amount: 0,
    discount: 0,
    team_members: [],
  })

  useEffect(() => {
    if (project) {
      setF({
        project_name: project.project_name,
        brand: project.brand,
        project_owner: project.project_owner,
        project_leader: project.project_leader,
        project_admins: (project.project_admins ?? []).map((user) => ({ user })),
        blocked_by: project.blocked_by ?? '',
        start_date: project.start_date ?? '',
        deadline: project.deadline ?? '',
        goal: project.goal ?? '',
        success_condition: project.success_condition ?? '',
        failure_condition: project.failure_condition ?? '',
        context: project.context ?? '',
        status: project.status,
        reward_type: project.reward_type ?? 'Rupiah',
        bonus_amount: project.bonus_amount ?? 0,
        discount: project.discount ?? 0,
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
  const owners = opts?.owners ?? []
  const leaders = opts?.leaders ?? []
  const brandOpts = opts?.brands ?? []
  const busy = create.isPending || update.isPending

  const blockedByOpts = (allProjects ?? [])
    .filter((p) => p.name !== project?.name)
    .map((p) => ({ value: p.name, label: p.project_name }))

  const inputCls =
    'w-full rounded-xl border border-line dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:text-slate-100'
  const sectionHead = 'text-xs font-semibold uppercase tracking-wide text-muted'

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit project' : 'New project'}
      widthClass="w-full sm:w-[60vw] max-w-none"
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {isEdit ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      {/* Wider drawer (60vw) lets the fields sit in grouped sections instead of one long column. */}
      <div className="flex flex-col gap-7">
        {/* ---- Basics ---- */}
        <section className="space-y-3">
          <h3 className={sectionHead}>Basics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-muted">
                Project name<span className="text-red-500"> *</span>
              </span>
              <input
                value={f.project_name}
                onChange={(e) => set('project_name', e.target.value)}
                className={inputCls}
              />
            </label>
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted">
                Brand<span className="text-red-500"> *</span>
              </span>
              <SearchableSelect
                value={f.brand}
                onChange={(v) => set('brand', v)}
                options={brandOpts}
                placeholder="Select…"
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted">Status</span>
              <SearchableSelect
                value={f.status}
                onChange={(v) => set('status', v)}
                options={STATUS_OPTS}
              />
            </div>
          </div>
        </section>

        {/* ---- People ---- */}
        <section className="space-y-3">
          <h3 className={sectionHead}>People</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted">
                Owner<span className="text-red-500"> *</span>
              </span>
              <SearchableSelect
                value={f.project_owner}
                onChange={(v) => set('project_owner', v)}
                options={owners}
                placeholder="Select…"
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted">
                Leader<span className="text-red-500"> *</span>
              </span>
              <SearchableSelect
                value={f.project_leader}
                onChange={(v) => set('project_leader', v)}
                options={leaders}
                placeholder="Select…"
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted">Admins</span>
              <MultiSelectSearch
                options={users}
                value={(f.project_admins ?? []).map((a) => a.user)}
                onChange={(vs) => set('project_admins', vs.map((user) => ({ user })))}
                placeholder="None"
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted">Team</span>
              <MultiSelectSearch
                options={users}
                value={(f.team_members ?? []).map((t) => t.user)}
                onChange={(vs) => set('team_members', vs.map((user) => ({ user })))}
                placeholder="Add team members…"
              />
            </div>
          </div>
        </section>

        {/* ---- Schedule & dependencies ---- */}
        <section className="space-y-3">
          <h3 className={sectionHead}>Schedule &amp; dependencies</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm font-medium text-muted">
                Start<span className="text-red-500"> *</span>
              </span>
              <DatePicker
                value={f.start_date}
                onChange={(v) => set('start_date', v)}
                className={inputCls}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-muted">
                Deadline<span className="text-red-500"> *</span>
              </span>
              <DatePicker
                value={f.deadline}
                onChange={(v) => set('deadline', v)}
                className={inputCls}
              />
            </label>
            <div className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-muted">Blocking project</span>
              <SearchableSelect
                value={f.blocked_by ?? ''}
                onChange={(v) => set('blocked_by', v)}
                options={blockedByOpts}
                allowClear
                placeholder="None — not blocked"
              />
              <p className="text-xs text-muted">The project this one depends on / is blocked by.</p>
            </div>
          </div>
        </section>

        {/* ---- AI context ---- */}
        <section className="space-y-3">
          <h3 className={sectionHead}>AI context</h3>
          <p className="-mt-1 text-xs text-muted">
            Feeds the “Generate with AI” drafts. All optional.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-muted">Goal</span>
              <textarea
                value={f.goal ?? ''}
                onChange={(e) => set('goal', e.target.value)}
                rows={2}
                placeholder="What this project is for"
                className={inputCls}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-muted">Success condition</span>
              <textarea
                value={f.success_condition ?? ''}
                onChange={(e) => set('success_condition', e.target.value)}
                rows={2}
                placeholder="What success looks like"
                className={inputCls}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-muted">Failure condition</span>
              <textarea
                value={f.failure_condition ?? ''}
                onChange={(e) => set('failure_condition', e.target.value)}
                rows={2}
                placeholder="What would count as failure"
                className={inputCls}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-muted">Context</span>
              <textarea
                value={f.context ?? ''}
                onChange={(e) => set('context', e.target.value)}
                rows={2}
                placeholder="Constraints, stack, audience — extra context for AI"
                className={inputCls}
              />
            </label>
          </div>
        </section>

        {/* ---- Reward ---- */}
        <section className="space-y-3">
          <h3 className={sectionHead}>Reward</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted">Reward type</span>
              <SearchableSelect
                value={f.reward_type ?? 'Rupiah'}
                onChange={(v) => set('reward_type', v as 'Rupiah' | 'Point')}
                options={[{ value: 'Rupiah', label: 'Rupiah' }, { value: 'Point', label: 'Point' }]}
              />
            </div>
            <label className="space-y-1">
              <span className="text-sm font-medium text-muted">
                {f.reward_type === 'Point' ? 'Bonus Points' : 'Bonus Amount (Rp)'}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={f.bonus_amount || ''}
                onChange={(e) => set('bonus_amount', Number(e.target.value) || 0)}
                className={inputCls}
              />
            </label>
          </div>
        </section>
      </div>
    </Drawer>
  )
}

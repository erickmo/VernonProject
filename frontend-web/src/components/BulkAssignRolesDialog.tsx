import { useState } from 'react'
import { useProjects, useFormOptions, useBulkAssignProjectRoles } from '@/hooks/useData'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { Segmented } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { parseFrappeError } from '@/lib/format'
import { Drawer } from '@web/components/overlays/Drawer'
import { Button } from '@web/components/ui'

type AdminMode = 'add' | 'replace'

// Bulk-set leader / admins across many projects at once. Mirrors ProjectFormDialog's
// leader (opts.leaders) + admins (opts.users) sources so option lists stay identical.
export function BulkAssignRolesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: allProjects } = useProjects()
  const { data: opts } = useFormOptions()
  const bulk = useBulkAssignProjectRoles()
  const toast = useToast()

  const [projects, setProjects] = useState<string[]>([])
  const [setLeader, setSetLeader] = useState(false)
  const [leader, setLeader_] = useState('')
  const [admins, setAdmins] = useState<string[]>([])
  const [adminMode, setAdminMode] = useState<AdminMode>('add')
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([])

  const reset = () => {
    setProjects([])
    setSetLeader(false)
    setLeader_('')
    setAdmins([])
    setAdminMode('add')
    setSkipped([])
  }
  const close = () => {
    reset()
    onClose()
  }

  const projectOpts = (allProjects ?? []).map((p) => ({ value: p.name, label: p.project_name }))
  const users = opts?.users ?? []
  const leaders = opts?.leaders ?? []

  // Nothing to do unless ≥1 project AND at least one of (set leader) / (some admins).
  // Backend rejects set_leader with an empty leader, so block that here too.
  const canApply = projects.length > 0 && !(setLeader && !leader) && (setLeader || admins.length > 0) && !bulk.isPending

  const submit = () => {
    if (!canApply) return
    setSkipped([])
    bulk.mutate(
      {
        projects,
        set_leader: setLeader,
        leader: setLeader ? leader || null : undefined,
        admins,
        admin_mode: adminMode,
      },
      {
        onSuccess: (r) => {
          toast('success', `Updated ${r.updated.length} project(s)`)
          if (r.skipped.length) setSkipped(r.skipped)
          else close()
        },
        onError: (err) => toast('error', parseFrappeError((err as Error).message)),
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Bulk assign roles"
      widthClass="max-w-lg"
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {skipped.length ? 'Close' : 'Cancel'}
          </Button>
          <Button variant="primary" type="submit" disabled={!canApply}>
            {bulk.isPending ? 'Applying…' : 'Apply'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Projects — required */}
        <div className="space-y-1">
          <span className="text-sm font-medium text-muted">
            Projects<span className="text-red-500"> *</span>
          </span>
          <MultiSelectSearch
            options={projectOpts}
            value={projects}
            onChange={setProjects}
            placeholder="Pick projects…"
          />
          <p className="text-xs text-muted">Changes apply to every selected project.</p>
        </div>

        {/* Set leader */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-muted">
            <input
              type="checkbox"
              checked={setLeader}
              onChange={(e) => setSetLeader(e.target.checked)}
              className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-600"
            />
            Set leader
          </label>
          {setLeader && (
            <SearchableSelect
              value={leader}
              onChange={setLeader_}
              options={leaders}
              placeholder="Select a leader…"
            />
          )}
          {!setLeader && (
            <p className="text-xs text-muted">Leader left untouched on the selected projects.</p>
          )}
        </div>

        {/* Admins */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-muted">Admins</span>
          <MultiSelectSearch
            options={users}
            value={admins}
            onChange={setAdmins}
            placeholder="Pick admins…"
          />
          <Segmented<AdminMode>
            value={adminMode}
            onChange={setAdminMode}
            options={[
              { value: 'add', label: 'Add to existing admins' },
              { value: 'replace', label: 'Replace admins' },
            ]}
          />
        </div>

        {/* Skipped result panel — inline, never an alert. */}
        {skipped.length > 0 && (
          <div className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
            <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {skipped.length} project(s) skipped
            </div>
            <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-200">
              {skipped.map((s) => (
                <li key={s.name}>
                  <span className="font-medium">{s.name}</span>: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Drawer>
  )
}

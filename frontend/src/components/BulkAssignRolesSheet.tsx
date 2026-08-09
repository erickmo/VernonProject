import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { useFormOptions, useProjects, useBulkAssignProjectRoles } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner, Segmented } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'

interface Props {
  open: boolean
  onClose: () => void
}

type AdminMode = 'add' | 'replace'

export function BulkAssignRolesSheet({ open, onClose }: Props) {
  const toast = useToast()
  const { data: opts } = useFormOptions()
  const { data: projects } = useProjects()
  const assign = useBulkAssignProjectRoles()

  const [picked, setPicked] = useState<string[]>([])
  const [setLeader, setSetLeader] = useState(false)
  const [leader, setLeader_] = useState('')
  const [admins, setAdmins] = useState<string[]>([])
  const [adminMode, setAdminMode] = useState<AdminMode>('add')
  const [skips, setSkips] = useState<{ name: string; reason: string }[]>([])

  const close = () => {
    // Reset local state so the next open starts clean.
    setPicked([])
    setSetLeader(false)
    setLeader_('')
    setAdmins([])
    setAdminMode('add')
    setSkips([])
    onClose()
  }

  if (!open) return null

  const nothingToDo = !setLeader && admins.length === 0
  const needsLeader = setLeader && !leader // backend requires a leader when set_leader is on
  const disabled = picked.length === 0 || nothingToDo || needsLeader || assign.isPending

  const apply = () => {
    setSkips([])
    assign.mutate(
      {
        projects: picked,
        set_leader: setLeader,
        leader: setLeader ? leader || null : null,
        admins,
        admin_mode: adminMode,
      },
      {
        onSuccess: (r) => {
          toast('success', `Updated ${r.updated.length} project(s)`)
          if (r.skipped.length) setSkips(r.skipped)
          else close()
        },
        onError: (err) => toast('error', (err as Error).message),
      },
    )
  }

  const projectOptions = (projects ?? []).map((p) => ({ value: p.name, label: p.project_name }))

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={close}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Bulk assign roles</h3>
          <button onClick={close} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Projects<span className="text-red-500"> *</span>
            <MultiSelectSearch
              options={projectOptions}
              value={picked}
              onChange={setPicked}
              placeholder="Select projects…"
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={setLeader}
              onChange={(e) => setSetLeader(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Set leader
          </label>
          {setLeader && (
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Leader
              <SearchableSelect value={leader} onChange={setLeader_} options={opts?.leaders ?? []} placeholder="Select…" />
            </label>
          )}

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Admins
            <MultiSelectSearch
              options={opts?.users ?? []}
              value={admins}
              onChange={setAdmins}
              placeholder="None"
            />
          </label>

          <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Admin mode
            <div className="mt-1">
              <Segmented<AdminMode>
                value={adminMode}
                onChange={setAdminMode}
                options={[
                  { value: 'add', label: 'Add to existing admins' },
                  { value: 'replace', label: 'Replace admins' },
                ]}
              />
            </div>
          </div>

          {skips.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-3">
              <p className="mb-1 text-sm font-semibold text-amber-800 dark:text-amber-300">
                {skips.length} skipped
              </p>
              <ul className="flex flex-col gap-1 text-xs text-amber-700 dark:text-amber-200/90">
                {skips.map((s) => (
                  <li key={s.name}>
                    <span className="font-medium">{s.name}</span>: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={skips.length > 0 ? close : apply}
            disabled={skips.length === 0 && disabled}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            {assign.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {skips.length > 0 ? 'Done' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}

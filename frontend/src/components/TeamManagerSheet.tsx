import { useEffect, useState } from 'react'
import { X, Check, Trash2, UserPlus } from 'lucide-react'
import { useFormOptions, useUpdateProject } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Avatar, Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { ProjectFull } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  project: ProjectFull
  /** May the user reassign owner/leader? (permFlags().can_reassign) */
  canReassign: boolean
}

export function TeamManagerSheet({ open, onClose, project, canReassign }: Props) {
  const toast = useToast()
  const { data: opts } = useFormOptions()
  const update = useUpdateProject(project.name)

  const [members, setMembers] = useState<string[]>([])
  const [owner, setOwner] = useState('')
  const [leader, setLeader] = useState('')
  const [admin, setAdmin] = useState('')

  // Seed the working copy from the loaded project each time the sheet opens.
  useEffect(() => {
    if (open) {
      setMembers(project.team.filter((t) => t.is_member).map((t) => t.user))
      setOwner(project.project_owner)
      setLeader(project.project_leader)
      setAdmin(project.project_admin ?? '')
    }
  }, [open, project])

  if (!open) return null

  const users = opts?.users ?? []

  const nameFor = (email: string) =>
    project.team.find((t) => t.user === email)?.name ??
    users.find((u) => u.value === email)?.label ??
    email
  const imageFor = (email: string) =>
    project.team.find((t) => t.user === email)?.image ?? null

  const roleOf = (email: string): string | null => {
    if (email === owner) return 'Owner'
    if (email === leader) return 'Leader'
    if (email === admin) return 'Admin'
    return null
  }

  // Assigning a role guarantees that user is in the member list (server hook
  // re-adds them anyway; keep the UI consistent up front).
  const ensureMember = (email: string) =>
    setMembers((m) => (email && !m.includes(email) ? [...m, email] : m))

  const setOwnerRole = (v: string) => { setOwner(v); ensureMember(v) }
  const setLeaderRole = (v: string) => { setLeader(v); ensureMember(v) }
  const setAdminRole = (v: string) => { setAdmin(v); ensureMember(v) }

  const addMember = (email: string) => ensureMember(email)
  const removeMember = (email: string) => {
    if (email === owner || email === leader || (admin && email === admin)) return
    setMembers((m) => m.filter((u) => u !== email))
  }

  const save = () => {
    if (!owner || !leader) {
      toast('error', 'Owner and leader are required')
      return
    }
    update.mutate(
      {
        team_members: members.map((user) => ({ user })),
        project_owner: owner,
        project_leader: leader,
        project_admin: admin || null,
      },
      {
        onSuccess: () => { toast('success', 'Team updated'); onClose() },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const addable = users.filter((u) => !members.includes(u.value))

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Manage team</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Roles */}
        <div className="mb-4 flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
          <label className="text-sm font-medium text-slate-600">
            Owner<span className="text-red-500"> *</span>
            <SearchableSelect value={owner} onChange={setOwnerRole} options={users} disabled={!canReassign} placeholder="Select…" />
          </label>
          <label className="text-sm font-medium text-slate-600">
            Leader<span className="text-red-500"> *</span>
            <SearchableSelect value={leader} onChange={setLeaderRole} options={users} disabled={!canReassign} placeholder="Select…" />
          </label>
          <label className="text-sm font-medium text-slate-600">
            Admin
            <SearchableSelect value={admin} onChange={setAdminRole} options={users} allowClear placeholder="None" />
          </label>
        </div>

        {/* Member */}
        <div className="mb-4">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <UserPlus className="h-4 w-4" /> Member
          </p>
          <SearchableSelect value="" onChange={addMember} options={addable} placeholder="Select user…" />
        </div>

        {/* Member list */}
        <div className="flex flex-col gap-2">
          {members.map((email) => {
            const role = roleOf(email)
            return (
              <div key={email} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={nameFor(email)} image={imageFor(email)} size={32} />
                  <span className="truncate text-sm font-medium text-slate-700">{nameFor(email)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {role ? (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">{role}</span>
                  ) : (
                    <button onClick={() => removeMember(email)} className="rounded-lg p-1.5 text-rose-600 active:bg-rose-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {!members.length && <p className="py-4 text-center text-sm text-slate-400">No members</p>}
        </div>

        <button onClick={save} disabled={update.isPending}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
          {update.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Save team
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Trash2, UserPlus, Check } from 'lucide-react'
import { useFormOptions, useUpdateProject } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Avatar, Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Drawer } from '@web/components/overlays/Drawer'
import { Button } from '@web/components/ui'
import type { ProjectFull } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  project: ProjectFull
  /** May the user reassign owner/leader? (permFlags().can_reassign) */
  canReassign: boolean
}

// Web port of the mobile TeamManagerSheet: a working-copy editor that PUTs the
// whole roster (members + owner/leader/admin) via a single useUpdateProject.
export function TeamManagerDrawer({ open, onClose, project, canReassign }: Props) {
  const toast = useToast()
  const { data: opts } = useFormOptions()
  const update = useUpdateProject(project.name)

  const [members, setMembers] = useState<string[]>([])
  const [owner, setOwner] = useState('')
  const [leader, setLeader] = useState('')
  const [admin, setAdmin] = useState('')

  useEffect(() => {
    if (open) {
      setMembers(project.team.filter((t) => t.is_member).map((t) => t.user))
      setOwner(project.project_owner)
      setLeader(project.project_leader)
      setAdmin(project.project_admin ?? '')
    }
  }, [open, project])

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
    <Drawer
      open={open}
      onClose={onClose}
      title="Manage team"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={update.isPending}>
            {update.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Save team
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Roles */}
        <div className="flex flex-col gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Owner<span className="text-red-500"> *</span>
            <SearchableSelect value={owner} onChange={setOwnerRole} options={users} disabled={!canReassign} placeholder="Select…" />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Leader<span className="text-red-500"> *</span>
            <SearchableSelect value={leader} onChange={setLeaderRole} options={users} disabled={!canReassign} placeholder="Select…" />
          </label>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Admin
            <SearchableSelect value={admin} onChange={setAdminRole} options={users} allowClear placeholder="None" />
          </label>
        </div>

        {/* Add member */}
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            <UserPlus className="h-4 w-4" /> Member
          </p>
          <SearchableSelect value="" onChange={addMember} options={addable} placeholder="Select user…" />
        </div>

        {/* Member list */}
        <div className="flex flex-col gap-2">
          {members.map((email) => {
            const role = roleOf(email)
            return (
              <div key={email} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={nameFor(email)} image={imageFor(email)} size={32} />
                  <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{nameFor(email)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {role ? (
                    <span className="rounded-full bg-brand-50 dark:bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">{role}</span>
                  ) : (
                    <button
                      onClick={() => removeMember(email)}
                      aria-label={`Remove ${nameFor(email)}`}
                      className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {!members.length && <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">No members</p>}
        </div>
      </div>
    </Drawer>
  )
}

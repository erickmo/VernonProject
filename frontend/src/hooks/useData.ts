import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { mobileApi, resource, renameDoc, passkeyApi } from '@/lib/api'
import { enrollPasskey } from '@/lib/webauthn'
import type {
  AppSettings,
  AvatarCatalog,
  Boot,
  Brand,
  Comment,
  Dashboard,
  DataHealth,
  FormOptions,
  Group,
  ManagedUser,
  MeetingInvitableUser,
  MeetingListItem,
  MemberTodo,
  ProjectCard,
  ProjectDetail,
  ProjectDetailInput,
  ProjectFull,
  ProjectInput,
  ProjectItem,
  ProjectItemDetail,
  GroupTodo,
  ScoringGroup,
  ScoringGroupPayload,
  UserFormPayload,
  Wallet,
  WalletLogEntry,
  Leaderboard,
  MarketplaceData,
  AdminReward,
  AdminRedemption,
  RewardFormPayload,
  PersonalNote,
  ActivityItem,
  ReactionKey,
  TeamWallResponse,
} from '@/lib/types'
import type { GanttGroup } from '@/lib/gantt'

export const keys = {
  boot: ['boot'] as const,
  dashboard: ['dashboard'] as const,
  calendar: ['calendar'] as const,
  projects: ['projects'] as const,
  project: (n: string) => ['project', n] as const,
  projectGantt: (n: string) => ['project-gantt', n] as const,
  projectDetail: (n: string) => ['project-detail', n] as const,
  projectItem: (n: string) => ['project-item', n] as const,
  memberWorkload: (p: string, u: string, c: boolean) =>
    ['member-workload', p, u, c] as const,
  scoringGroups: ['scoring-groups'] as const,
  scoringGroup: (n: string) => ['scoring-group', n] as const,
  groupTodos: (n: string) => ['group-todos', n] as const,
  brands: ['brands'] as const,
  brand: (n: string) => ['brand', n] as const,
  users: ['users'] as const,
  wallet: ['wallet'] as const,
  walletLog: ['wallet-log'] as const,
  leaderboard: (period: string, brand: string | null) =>
    ['leaderboard', period, brand ?? ''] as const,
  marketplace: ['marketplace'] as const,
  rewardsAdmin: ['rewards-admin'] as const,
  rewardAdmin: (n: string) => ['reward-admin', n] as const,
  redemptionsAdmin: (s: string) => ['redemptions-admin', s] as const,
  giftRecipients: ['gift-recipients'] as const,
  notifications: ['notifications'] as const,
  personalNotes: ['personalNotes'] as const,
  meetings: ['meetings'] as const,
  meeting: (n: string) => ['meeting', n] as const,
  passkeys: ['passkeys'] as const,
  teamActivity: ['team-activity'] as const,
  avatarCatalog: ['avatar-catalog'] as const,
  feedbackInbox: (status?: string) => ['feedback-inbox', status ?? 'all'] as const,
  myAttendance: ['my-attendance'] as const,
  gamification: ['gamification'] as const,
  teamWall: ['team-wall'] as const,
}

export const useBoot = () =>
  useQuery({ queryKey: keys.boot, queryFn: () => mobileApi.bootstrap() as Promise<Boot>, retry: false })

export const useDashboard = () =>
  useQuery({ queryKey: keys.dashboard, queryFn: () => mobileApi.dashboard() as Promise<Dashboard> })

export const useCalendar = () =>
  useQuery({
    queryKey: keys.calendar,
    queryFn: () => mobileApi.calendar() as Promise<{ todos: ProjectItem[] }>,
  })

export const useProjects = () =>
  useQuery({ queryKey: keys.projects, queryFn: () => mobileApi.projects() as Promise<ProjectCard[]> })

export const useProject = (name: string) =>
  useQuery({
    queryKey: keys.project(name),
    queryFn: () => mobileApi.project(name) as Promise<ProjectFull>,
    enabled: !!name,
  })

export const useProjectGantt = (name: string, enabled = true) =>
  useQuery({
    queryKey: keys.projectGantt(name),
    queryFn: () => mobileApi.projectGantt(name) as Promise<GanttGroup[]>,
    enabled: !!name && enabled,
  })

export const useMemberWorkload = (
  project: string,
  user: string | null,
  includeCompleted: boolean,
) =>
  useQuery({
    queryKey: keys.memberWorkload(project, user ?? '', includeCompleted),
    queryFn: () =>
      mobileApi.memberWorkload(project, user as string, includeCompleted) as Promise<MemberTodo[]>,
    enabled: !!project && !!user,
  })

export function useProjectDetail(name: string, includeCancelled = false) {
  return useQuery({
    queryKey: ['project-detail', name, includeCancelled],
    queryFn: () => mobileApi.projectDetail(name, includeCancelled) as Promise<ProjectDetail>,
    enabled: !!name,
  })
}

export const useProjectItem = (name: string) =>
  useQuery({
    queryKey: keys.projectItem(name),
    queryFn: () => mobileApi.projectItem(name) as Promise<ProjectItemDetail>,
    enabled: !!name,
  })

// Advance a todo's status one step. Returns the server message so the caller
// can surface success/permission feedback via toast.
export function useAdvanceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (todoId: string) => {
      const res = await mobileApi.advanceStatus(todoId)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
    },
  })
}

export function useCancelTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectItem, reason }: { projectItem: string; reason?: string }) => {
      const res = await mobileApi.cancelTodo(projectItem, reason)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
    },
  })
}

export function useRestoreTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectItem: string) => {
      const res = await mobileApi.restoreTodo(projectItem)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
    },
  })
}

export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectItem: string) => {
      const res = await mobileApi.deleteTodo(projectItem)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
    },
  })
}

export interface Opt {
  value: string
  label: string
}
export interface ReportOptions {
  projects: Opt[]
  users: Opt[]
  todo_statuses: Opt[]
  pd_statuses: Opt[]
  perf_statuses: Opt[]
}
export interface ReportResult {
  columns: { label: string; fieldname: string; fieldtype: string }[]
  rows: Record<string, unknown>[]
  total: number
  messages: string[]
}

export const useReportOptions = () =>
  useQuery({
    queryKey: ['report-options'],
    queryFn: () => mobileApi.reportOptions() as Promise<ReportOptions>,
    staleTime: 1000 * 60 * 10,
  })

export const useReport = (report: string, filters: Record<string, unknown>, enabled: boolean) =>
  useQuery({
    queryKey: ['report', report, filters],
    queryFn: () => mobileApi.runReport(report, filters) as Promise<ReportResult>,
    enabled,
    staleTime: 1000 * 30,
  })

export function useUpdateTodo(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fields: Record<string, unknown>) => {
      const res = await mobileApi.updateTodo(todoId, fields)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projectItem(todoId) })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.projects })
    },
  })
}

export function useSetTodoAllocations(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (allocations: { date: string; minutes: number; note?: string }[]) => {
      const res = await mobileApi.setTodoAllocations(todoId, allocations)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projectItem(todoId) })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useSetAssignedAllocation(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (allocations: { date: string; minutes: number; note?: string }[]) => {
      const res = await mobileApi.setAssignedAllocation(todoId, allocations)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projectItem(todoId) })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useCreateProjectItem(projectDetail: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      mobileApi.createTask({ project_detail: projectDetail, ...fields }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projectDetail(projectDetail) })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useSaveNotes(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (notes: string) => {
      const res = await mobileApi.saveNotes(todoId, notes)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projectItem(todoId) }),
  })
}

export function permFlags(project: ProjectFull, boot: Boot | undefined) {
  const me = boot?.user
  const isSM = !!boot?.roles.includes('System Manager')
  const isOwner = !!me && me === project.project_owner
  const isLeader = !!me && me === project.project_leader
  return {
    can_edit: isSM || isOwner || isLeader,
    can_delete: isSM || isOwner,
    can_reassign: isSM || isOwner,
  }
}

export function canCreateProject(boot: Boot | undefined): boolean {
  return !!boot && (boot.roles.includes('System Manager') || boot.roles.includes('Project Owner'))
}

export function canManageGroups(boot: Boot | undefined): boolean {
  return !!boot && (
    boot.roles.includes('System Manager') ||
    boot.roles.includes('Group Manager')
  )
}

export function useFormOptions() {
  return useQuery({
    queryKey: ['form-options'],
    // Options come from a whitelisted method, not /api/resource: the User
    // doctype is readable only by System Manager, so a raw resource list of
    // users 403s for project leads. get_form_options uses frappe.get_all
    // server-side, which bypasses the per-doctype read gate.
    queryFn: () => mobileApi.formOptions() as Promise<FormOptions>,
    staleTime: 1000 * 60 * 10,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectInput) =>
      resource.create<{ name: string }>('Project', input as unknown as Record<string, unknown>),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useUpdateProject(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<ProjectInput>) =>
      resource.update<{ name: string }>('Project', project, input as Record<string, unknown>),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.project(project) })
      qc.invalidateQueries({ queryKey: keys.projects })
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (project: string) => resource.remove('Project', project),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useCreateProjectDetail(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<ProjectDetailInput, 'project'>) =>
      resource.create<{ name: string }>('Project Detail', {
        // project_deadline is read_only + fetch_from project.deadline on the
        // doctype, so it is populated server-side — never sent from the client.
        project,
        title: input.title,
        ...(input.is_pending != null ? { is_pending: input.is_pending } : {}),
        ...(input.current_condition != null ? { current_condition: input.current_condition } : {}),
        ...(input.expected_outcome != null ? { expected_outcome: input.expected_outcome } : {}),
        ...(input.keterangan_di_sow != null ? { keterangan_di_sow: input.keterangan_di_sow } : {}),
        ...(input.discount != null ? { discount: input.discount } : {}),
        ...(input.price != null ? { price: input.price } : {}),
        ...(input.glossaries ? { glossaries: input.glossaries } : {}),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.project(project) })
    },
  })
}

export function useUpdateProjectDetail(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      resource.update<{ name: string }>('Project Detail', name, fields),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projectDetail(name) })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useDeleteProjectDetail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Project Detail', name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useGroups(project: string, enabled = true) {
  return useQuery({
    queryKey: ['groups', project],
    queryFn: () =>
      resource.list<Group[]>('Glossary', {
        filters: [['project', '=', project]],
        fields: ['name', 'glossary', 'description'],
      }),
    enabled: !!project && enabled,
  })
}

export function useCreateGroup(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { glossary: string; description?: string }) =>
      resource.create<{ name: string }>('Glossary', { ...input, project }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['groups', project] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useUpdateGroup(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, ...fields }: { name: string; glossary?: string; description?: string }) =>
      resource.update<{ name: string }>('Glossary', name, fields),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['groups', project] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useDeleteGroup(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Glossary', name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['groups', project] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useComments(refDoctype: string, refName: string) {
  return useQuery({
    queryKey: ['comments', refDoctype, refName],
    queryFn: () => mobileApi.getComments(refDoctype, refName) as Promise<Comment[]>,
    enabled: !!refName,
  })
}

export function useAddComment(refDoctype: string, refName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => mobileApi.addComment(refDoctype, refName, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', refDoctype, refName] }),
  })
}

export function useScoringGroups() {
  return useQuery({
    queryKey: keys.scoringGroups,
    queryFn: () =>
      resource.list<ScoringGroup[]>('Group', {
        fields: ['name', 'group_name', 'description', 'leader_weight', 'base_rate_per_minute'],
        limit: 0,
      }),
  })
}

export function useScoringGroup(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.scoringGroup(name),
    queryFn: () => resource.get<ScoringGroup>('Group', name),
    enabled: !!name && enabled,
  })
}

// Project Todos linked to a scoring Group, newest deadline first.
export function useGroupTodos(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.groupTodos(name),
    queryFn: () =>
      resource.list<GroupTodo[]>('Project Todo', {
        filters: [['group', '=', name]],
        fields: ['name', 'to_do', 'status', 'project', 'deadline'],
      }),
    enabled: !!name && enabled,
  })
}

export function useCreateScoringGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ScoringGroupPayload) =>
      resource.create<{ name: string }>('Group', payload as unknown as Record<string, unknown>),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.scoringGroups })
    },
  })
}

export function useUpdateScoringGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: ScoringGroupPayload }) =>
      resource.update<{ name: string }>('Group', name, payload as unknown as Record<string, unknown>),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: keys.scoringGroups })
      qc.invalidateQueries({ queryKey: keys.scoringGroup(vars.name) })
    },
  })
}

export function useMergeScoringGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      renameDoc('Group', source, target, true),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.scoringGroups }),
  })
}

export function useDeleteScoringGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Group', name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.scoringGroups })
    },
  })
}

export function canManageBrands(boot: Boot | undefined): boolean {
  return !!boot && (
    boot.roles.includes('System Manager') ||
    boot.roles.includes('Project Owner') ||
    boot.roles.includes('Group Manager')
  )
}

export function canManageUsers(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

export function canManageBadges(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

// ponytail: System Manager only for v1. Add an 'Attendance Manager' role + check here if delegation is needed.
export function canManageAttendance(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

// The Vernon roles assignable from the mobile user-management screen.
export const VERNON_ROLE_OPTIONS = [
  { value: 'Project Owner', label: 'Owner' },
  { value: 'Project Leader', label: 'Leader' },
  { value: 'Project Admin', label: 'Admin' },
  { value: 'Project Team', label: 'Team' },
  { value: 'Points Granter', label: 'Points Granter' },
]

// Member-type marking on a user. '' = external/unset. Must match MEMBER_TYPES in mobile.py.
export const MEMBER_TYPE_OPTIONS = [
  { value: 'Internal Team', label: 'Internal Team' },
  { value: 'Intern', label: 'Intern' },
]

export function useBrands() {
  return useQuery({
    queryKey: keys.brands,
    queryFn: () => resource.list<Brand[]>('Brand', { fields: ['name', 'brand_name'], limit: 0 }),
  })
}

export function useBrand(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.brand(name),
    queryFn: () => resource.get<Brand>('Brand', name),
    enabled: !!name && enabled,
  })
}

export function useCreateBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { brand_name: string }) =>
      resource.create<{ name: string }>('Brand', payload as unknown as Record<string, unknown>),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.brands }),
  })
}

export function useUpdateBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: { brand_name: string } }) =>
      resource.update<{ name: string }>('Brand', name, payload as unknown as Record<string, unknown>),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: keys.brands })
      qc.invalidateQueries({ queryKey: keys.brand(vars.name) })
    },
  })
}

export function useDeleteBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Brand', name),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.brands }),
  })
}

export function useMergeBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      renameDoc('Brand', source, target, true),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.brands })
      qc.invalidateQueries({ queryKey: keys.projects })
    },
  })
}

export function useUsers() {
  return useQuery({
    queryKey: keys.users,
    queryFn: async () => (await mobileApi.listUsers()).users as ManagedUser[],
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      email: string
      full_name: string
      roles: string[]
      send_welcome: boolean
      member_type?: string
    }) => mobileApi.createUser(payload),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.users }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ user, payload }: { user: string; payload: UserFormPayload }) =>
      mobileApi.updateUser(user, payload),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.users }),
  })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (user: string) => mobileApi.resetUserPassword(user),
  })
}

export function useSetUserPassword() {
  return useMutation({
    mutationFn: ({ user, newPassword }: { user: string; newPassword: string }) =>
      mobileApi.setUserPassword(user, newPassword),
  })
}

export function useChangeMyPassword() {
  return useMutation({
    mutationFn: ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) =>
      mobileApi.changeMyPassword(oldPassword, newPassword),
  })
}

export function usePasskeys() {
  return useQuery({ queryKey: keys.passkeys, queryFn: () => passkeyApi.listPasskeys() })
}

export function useEnrollPasskey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (label: string) => enrollPasskey(label),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.passkeys }),
  })
}

export function useRevokePasskey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => passkeyApi.revokePasskey(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.passkeys }),
  })
}

export const useWallet = () =>
  useQuery({ queryKey: keys.wallet, queryFn: () => mobileApi.getWallet() as Promise<Wallet> })

export const useWalletLog = () =>
  useQuery({ queryKey: keys.walletLog, queryFn: () => mobileApi.getWalletLog() as Promise<WalletLogEntry[]> })

export interface WeeklyRecap {
  week_offset: number
  week_label: string
  week_start: string
  week_end: string
  completed: number
  minutes: number
  points: number
  best_day: { label: string; count: number } | null
  streak: number
  top_project: { name: string; count: number } | null
  kudos_received: number
  kudos_given: number
  top_appreciator: { user: string; name: string; count: number } | null
}

// Read-only weekly summary. weekOffset 0 = current week, -1 = last week.
export const useWeeklyRecap = (weekOffset = 0) =>
  useQuery({
    queryKey: ['weekly-recap', weekOffset] as const,
    queryFn: () => mobileApi.getWeeklyRecap(weekOffset) as Promise<WeeklyRecap>,
    staleTime: 1000 * 60 * 5,
  })

// Reciprocity: thank someone who cheered your work this week (fires a Kudos
// notification to them; no points).
export function useSayThanks() {
  return useMutation({
    mutationFn: async (toUser: string) => {
      const res = await mobileApi.sayThanks(toUser)
      if (res.status === 'error') throw new Error(res.message || 'Could not send thanks')
      return res
    },
  })
}

export function useGiftRecipients() {
  return useQuery({
    queryKey: keys.giftRecipients,
    queryFn: () => mobileApi.listGiftRecipients(),
  })
}

export function useGiftPoints() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ toUser, amount, note }: { toUser: string; amount: number; note?: string }) =>
      mobileApi.giftPoints(toUser, amount, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallet })
      qc.invalidateQueries({ queryKey: keys.walletLog })
    },
  })
}

export const useLeaderboard = (period: string, brand: string | null, dimension = 'productivity') =>
  useQuery({
    queryKey: [...keys.leaderboard(period, brand), dimension],
    queryFn: () => mobileApi.getLeaderboard(period, brand, dimension) as Promise<Leaderboard>,
  })

export const useTeamWall = () =>
  useQuery({ queryKey: keys.teamWall, queryFn: () => mobileApi.getTeamWall() as Promise<TeamWallResponse> })

export const useMarketplace = () =>
  useQuery({ queryKey: keys.marketplace, queryFn: () => mobileApi.getMarketplace() as Promise<MarketplaceData> })

export function useRedeemReward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reward: string) => mobileApi.redeemReward(reward),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.marketplace })
      qc.invalidateQueries({ queryKey: keys.wallet })
      qc.invalidateQueries({ queryKey: keys.walletLog })
    },
  })
}

export function canManageMarketplace(boot: Boot | undefined): boolean {
  return !!boot && (
    boot.roles.includes('System Manager') ||
    boot.roles.includes('Marketplace Manager')
  )
}

export function canGrantPoints(boot: Boot | undefined): boolean {
  return !!boot && (
    boot.roles.includes('System Manager') ||
    boot.roles.includes('Points Granter')
  )
}

export function useRewardsAdmin() {
  return useQuery({
    queryKey: keys.rewardsAdmin,
    queryFn: () =>
      resource.list<AdminReward[]>('Marketplace Reward', {
        fields: ['name', 'reward_name', 'point_cost', 'stock_quantity', 'active', 'image'],
        limit: 0,
      }),
  })
}

export function useReward(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.rewardAdmin(name),
    queryFn: () => resource.get<AdminReward>('Marketplace Reward', name),
    enabled: !!name && enabled,
  })
}

export function useCreateReward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: RewardFormPayload) =>
      resource.create<{ name: string }>('Marketplace Reward', payload as unknown as Record<string, unknown>),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.rewardsAdmin })
      qc.invalidateQueries({ queryKey: keys.marketplace })
    },
  })
}

export function useUpdateReward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: RewardFormPayload }) =>
      resource.update<{ name: string }>('Marketplace Reward', name, payload as unknown as Record<string, unknown>),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: keys.rewardsAdmin })
      qc.invalidateQueries({ queryKey: keys.rewardAdmin(vars.name) })
      qc.invalidateQueries({ queryKey: keys.marketplace })
    },
  })
}

export function useDeleteReward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Marketplace Reward', name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.rewardsAdmin })
      qc.invalidateQueries({ queryKey: keys.marketplace })
    },
  })
}

export function useRedemptionsAdmin(status: string) {
  return useQuery({
    queryKey: keys.redemptionsAdmin(status),
    queryFn: () => mobileApi.listRedemptions(status) as Promise<AdminRedemption[]>,
  })
}

export function useFulfillRedemption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      resource.update<{ name: string }>('Reward Redemption', name, { status: 'Fulfilled' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['redemptions-admin'] }),
  })
}



export function useGamificationSettings() {
  return useQuery({
    queryKey: ['gamification-settings'],
    queryFn: () => mobileApi.getGamificationSettings(),
  })
}

export function useSaveGamificationSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Parameters<typeof mobileApi.saveGamificationSettings>[0]) =>
      mobileApi.saveGamificationSettings(p),
    onSettled: () => qc.invalidateQueries({ queryKey: ['gamification-settings'] }),
  })
}

export function useAppSettings() {
  return useQuery({ queryKey: ['app-settings'], queryFn: () => mobileApi.getAppSettings() as Promise<AppSettings> })
}

export function useSaveAppSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (settings: Partial<AppSettings>) => mobileApi.saveAppSettings(settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-settings'] }),
  })
}

export function useNotifications() {
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => mobileApi.getNotifications(30),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => mobileApi.markNotificationRead(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => mobileApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  })
}

export function useDataHealth() {
  return useQuery({ queryKey: ['data-health'], queryFn: () => mobileApi.dataHealth() as Promise<DataHealth>, retry: false })
}

export function usePersonalNotes() {
  return useQuery({
    queryKey: keys.personalNotes,
    queryFn: () =>
      mobileApi.getPersonalNotes() as Promise<{
        owned: PersonalNote[]
        shared: PersonalNote[]
      }>,
  })
}

export const useMeetings = (project?: string) =>
  useQuery({
    queryKey: project ? (['meetings', project] as const) : keys.meetings,
    queryFn: () => mobileApi.listMeetings(project),
  })

export const useMeetingInvitableUsers = (project: string) =>
  useQuery({
    queryKey: ['meeting-invitable', project] as const,
    queryFn: () => mobileApi.meetingInvitableUsers(project),
    enabled: !!project,
  })

export function useCreateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fields: Record<string, unknown>) => {
      const res = await mobileApi.createMeeting(fields)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.meetings })
    },
  })
}

export function useMarkMeetingDone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (meeting: string) => {
      const res = await mobileApi.markMeetingDone(meeting)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.meetings })
      qc.invalidateQueries({ queryKey: keys.wallet })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useReopenMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (meeting: string) => {
      const res = await mobileApi.reopenMeeting(meeting)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.meetings })
      qc.invalidateQueries({ queryKey: keys.wallet })
    },
  })
}

export function useTeamActivity(days = 14) {
  return useQuery({
    queryKey: keys.teamActivity,
    queryFn: async () => (await mobileApi.getTeamActivity(days)).items,
  })
}

const REACTION_KEYS: ReactionKey[] = ['clap', 'celebrate', 'fire', 'heart']

// Mirror the server's toggle math so the optimistic update matches: same
// reaction removes it; a different one replaces; none adds.
function applyToggle(item: ActivityItem, reaction: ReactionKey): ActivityItem {
  const reactions = { ...item.reactions }
  let my = item.my_reaction
  if (my === reaction) {
    reactions[reaction] = Math.max(0, reactions[reaction] - 1)
    my = null
  } else {
    if (my) reactions[my] = Math.max(0, reactions[my] - 1)
    reactions[reaction] = reactions[reaction] + 1
    my = reaction
  }
  const total = REACTION_KEYS.reduce((s, k) => s + reactions[k], 0)
  return { ...item, reactions, my_reaction: my, total }
}

export function useToggleReaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ todo, reaction }: { todo: string; reaction: ReactionKey }) =>
      mobileApi.toggleReaction(todo, reaction),
    onMutate: async ({ todo, reaction }) => {
      await qc.cancelQueries({ queryKey: keys.teamActivity })
      const prev = qc.getQueryData<ActivityItem[]>(keys.teamActivity)
      qc.setQueryData<ActivityItem[]>(keys.teamActivity, (old) =>
        (old ?? []).map((it) => (it.name === todo ? applyToggle(it, reaction) : it)),
      )
      return { prev }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.teamActivity, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.teamActivity })
    },
  })
}

export function useAvatarCatalog() {
  return useQuery({
    queryKey: keys.avatarCatalog,
    queryFn: () => mobileApi.getAvatarCatalog() as Promise<AvatarCatalog>,
  })
}

export function useBuyAvatarOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ style, slot, value }: { style: string; slot: string; value: string }) =>
      mobileApi.buyAvatarOption(style, slot, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.avatarCatalog })
      qc.invalidateQueries({ queryKey: keys.boot })
    },
  })
}

export function useBuyAvatarAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (asset_name: string) => mobileApi.buyAvatarAsset(asset_name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.avatarCatalog })
      qc.invalidateQueries({ queryKey: keys.boot })
    },
  })
}

export function useSaveAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ config, snapshot }: { config: import('../lib/types').AvatarConfig; snapshot?: string }) =>
      mobileApi.saveMyAvatar(config, snapshot),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.avatarCatalog })
      qc.invalidateQueries({ queryKey: keys.boot })
    },
  })
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (v: { feedback_type: string; message: string; is_anonymous: boolean }) =>
      mobileApi.submitFeedback(v.feedback_type, v.message, v.is_anonymous),
  })
}

export function useFeedbackInbox(status?: string) {
  return useQuery({
    queryKey: keys.feedbackInbox(status),
    queryFn: () => mobileApi.listFeedback(status),
  })
}

export function useSetFeedbackStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { name: string; status: string }) =>
      mobileApi.setFeedbackStatus(v.name, v.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback-inbox'] }),
  })
}

export function useMyAttendance() {
  return useQuery({
    queryKey: keys.myAttendance,
    queryFn: () => mobileApi.myAttendance() as Promise<{
      status: string
      rows: {
        attendance_date: string
        status: string
        first_scan: string | null
        last_scan: string | null
        late_minutes: number
        early_minutes: number
        penalty_points: number
      }[]
    }>,
  })
}

export function useScanAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { station: string; counter: number; token: string }) => {
      const res = await mobileApi.attendanceScan(vars.station, vars.counter, vars.token)
      if (res.status !== 'ok') throw new Error(res.message || 'Scan failed')
      return res
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.myAttendance }),
  })
}

export function useRequestException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { from_date: string; to_date: string; exception_type: 'WFH' | 'Leave'; reason?: string }) => {
      const res = await mobileApi.requestException(vars.from_date, vars.to_date, vars.exception_type, vars.reason)
      if (res.status !== 'ok') throw new Error(res.message || 'Request failed')
      return res
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.myAttendance }),
  })
}

export const useGamification = () =>
  useQuery({
    queryKey: keys.gamification,
    queryFn: () => mobileApi.getGamification() as Promise<import('../lib/types').Gamification>,
  })

export function useClaimDaily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => mobileApi.claimDaily(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.gamification })
      qc.invalidateQueries({ queryKey: keys.boot })
      qc.invalidateQueries({ queryKey: keys.avatarCatalog })
    },
  })
}

export function useAttendanceReport(
  filters: { from_date: string; to_date: string; employee?: string; brand?: string; status?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['attendance-report', filters],
    queryFn: () => mobileApi.attendanceReport(filters),
    enabled,
    staleTime: 1000 * 30,
  })
}


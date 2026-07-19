import { useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { mobileApi, resource, renameDoc, passkeyApi, eventsApi, eventsAdminApi, checkAvailability, papanApi, lmsApi, uploadTodoFile } from '@/lib/api'
import { enrollPasskey } from '@/lib/webauthn'
import type {
  AppSettings,
  AvatarCatalog,
  Boot,
  Brand,
  Company,
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
  IncomeData,
  IncomeManageData,
  AdminReward,
  AdminRedemption,
  RewardFormPayload,
  PersonalNote,
  ActivityItem,
  ReactionKey,
  TeamWallResponse,
  EventFormPayload,
  Booking,
  MeetingRoom,
  Equipment,
  AdPayload,
  LmsCourseCard,
  LmsCourseDetail,
  LmsMyEnrollment,
  LmsManagedCourse,
  LmsReportRow,
  LmsCompleteResult,
  LeaveType,
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
  companies: ['companies'] as const,
  company: (n: string) => ['company', n] as const,
  users: ['users'] as const,
  wallet: ['wallet'] as const,
  walletLog: ['wallet-log'] as const,
  leaderboard: (period: string, brand: string | null) =>
    ['leaderboard', period, brand ?? ''] as const,
  marketplace: ['marketplace'] as const,
  income: ['income'] as const,
  incomeManage: ['income-manage'] as const,
  rewardsAdmin: ['rewards-admin'] as const,
  rewardAdmin: (n: string) => ['reward-admin', n] as const,
  redemptionsAdmin: (s: string) => ['redemptions-admin', s] as const,
  giftRecipients: ['gift-recipients'] as const,
  notifications: ['notifications'] as const,
  notificationFeed: ['notification-feed'] as const,
  personalNotes: ['personalNotes'] as const,
  meetings: ['meetings'] as const,
  meeting: (n: string) => ['meeting', n] as const,
  passkeys: ['passkeys'] as const,
  teamActivity: ['team-activity'] as const,
  avatarCatalog: ['avatar-catalog'] as const,
  crateStatus: ['crate-status'] as const,
  feedbackInbox: (status?: string) => ['feedback-inbox', status ?? 'all'] as const,
  myAttendance: ['my-attendance'] as const,
  gamification: ['gamification'] as const,
  teamWall: ['team-wall'] as const,
  events: ['events'] as const,
  event: (n: string) => ['event', n] as const,
  myRegistrations: ['myRegistrations'] as const,
  managedEvents: ['managedEvents'] as const,
  managedEvent: (n: string) => ['managedEvent', n] as const,
  eventRoster: (e: string) => ['eventRoster', e] as const,
  bookings: ['bookings'] as const,
  booking: (n: string) => ['booking', n] as const,
  meetingRooms: ['meeting-rooms'] as const,
  meetingRoom: (n: string) => ['meeting-room', n] as const,
  equipmentList: ['equipment-list'] as const,
  equipmentItem: (n: string) => ['equipment-item', n] as const,
  pendingExceptionApprovals: ['pendingExceptionApprovals'] as const,
  hrPendingExceptions: ['hrPendingExceptions'] as const,
  myLeaders: ['myLeaders'] as const,
  myExceptions: ['myExceptions'] as const,
  employeeProfile: (user: string) => ['employee-profile', user] as const,
  dailyVerse: ['daily-verse'] as const,
  ads: (adType?: string, q?: string, mine?: boolean) =>
    ['ads', adType ?? 'all', q ?? '', mine ? 'mine' : 'all'] as const,
  ad: (n: string) => ['ad', n] as const,
  adBans: ['adBans'] as const,
  lmsCatalog: ['lms-catalog'] as const,
  lmsCourse: (n: string) => ['lms-course', n] as const,
  lmsMine: ['lms-mine'] as const,
  lmsManage: ['lms-manage'] as const,
  lmsReport: (c: string) => ['lms-report', c] as const,
  lmsAssignable: ['lms-assignable'] as const,
  logbook: (from_date: string, to_date: string, user?: string) =>
    ['logbook', from_date, to_date, user ?? ''] as const,
  websiteSettings: ['website-settings'] as const,
  userNotes: (user: string) => ['user-notes', user] as const,
  userLeaders: (user: string) => ['user-leaders', user] as const,
  ledUsers: ['led-users'] as const,
  superpowers: ['superpowers'] as const,
  userSuperpowers: (user: string) => ['user-superpowers', user] as const,
  superpowerSettings: ['superpower-settings'] as const,
}

const VERSE_SUPPORTED = new Set(['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha'])

export function useDailyVerse() {
  const { data: boot } = useBoot()
  const emp = boot?.employee
  const on = !!emp?.verse_enabled && !!emp?.religion && VERSE_SUPPORTED.has(emp.religion)
  return useQuery({
    queryKey: keys.dailyVerse,
    queryFn: () => mobileApi.dailyVerse(),
    enabled: on,
    staleTime: 6 * 60 * 60 * 1000, // once every 6h is plenty for a daily verse
  })
}

export const useBoot = () =>
  useQuery({ queryKey: keys.boot, queryFn: () => mobileApi.bootstrap() as Promise<Boot>, retry: false })

// Per-user focus preference (backend-persisted on Employee Profile, so it
// follows the user across /m and /w). Drives whether a todo's Focus chip opens
// the full-screen overlay or just runs the timer on the card. Defaults to
// 'fullscreen' — the behaviour before this setting existed.
export const useFocusMode = (): import('@/lib/types').FocusMode =>
  useBoot().data?.employee?.focus_mode ?? 'fullscreen'

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

// Process a bulk review action (approve or reject) item-by-item so the UI can
// show a DETERMINATE progress bar (done/total). Each item hits the same per-todo,
// permission-checked endpoint a single action would, so gates + points behave
// identically; a failure is counted, not fatal. Invalidates the review queues
// once at the end. Returns { ok, failed }.
// ponytail: client loop instead of the bulk_* endpoints because a single request
// yields no incremental progress; review batches are small so N requests is fine.
export function useBulkProcess() {
  const qc = useQueryClient()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const run = async (ids: string[], mode: 'approve' | 'reject', reason = '') => {
    if (!ids.length) return { ok: 0, failed: 0 }
    let ok = 0
    setProgress({ done: 0, total: ids.length })
    for (let i = 0; i < ids.length; i++) {
      try {
        const res =
          mode === 'reject'
            ? await mobileApi.rejectStatus(ids[i], reason)
            : await mobileApi.advanceStatus(ids[i])
        if (res.status !== 'error') ok++
      } catch {
        /* count as failed, keep going */
      }
      setProgress({ done: i + 1, total: ids.length })
    }
    qc.invalidateQueries({ queryKey: keys.dashboard })
    qc.invalidateQueries({ queryKey: keys.projects })
    qc.invalidateQueries({ queryKey: ['project'] })
    qc.invalidateQueries({ queryKey: ['project-detail'] })
    qc.invalidateQueries({ queryKey: ['project-item'] })
    setProgress(null)
    return { ok, failed: ids.length - ok }
  }

  return { run, progress, busy: progress !== null }
}

// Reject a todo under review, bouncing it back to Planned with a required
// reason. Invalidates the same queries as an advance so review queues refresh.
export function useRejectStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ todoId, reason }: { todoId: string; reason: string }) => {
      const res = await mobileApi.rejectStatus(todoId, reason)
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

// Owner-only auto-approve toggle. Skips the owner approval gate at "Checked By
// PL". Invalidates the same queries as an advance so the detail/review refresh.
export function useSetAutoApprove() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ todoId, mode }: { todoId: string; mode: 'on' | 'off' | 'inherit' }) => {
      const res = await mobileApi.setAutoApprove(todoId, mode)
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

// Project-level auto-approve default. Owner/admin only; affects todos whose
// own mode is "inherit". Invalidates the same query set as the todo-level
// toggle plus the projects list (project cards may surface the setting).
export function useSetProjectAutoApprove() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ project, enabled }: { project: string; enabled: 0 | 1 }) => {
      const res = await mobileApi.setProjectAutoApprove(project, enabled)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
    },
  })
}

// Structure-clone a project (header + groupings + work items, progress reset,
// no todos). Returns the new project name so the caller can navigate to it.
export function useDuplicateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ project }: { project: string }) => mobileApi.duplicateProject(project),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
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

// Postpone (or pull earlier) a Project or single Project Detail by picking a
// new deadline date. The server shifts every date field of every active todo
// under the target by the same delta. Invalidates the same broad query set as
// useUpdateTodo since many todos + the container move at once.
export function usePostpone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      targetType,
      targetName,
      newDate,
    }: {
      targetType: 'Project' | 'Project Detail'
      targetName: string
      newDate: string
    }) => mobileApi.postpone(targetType, targetName, newDate),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
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

// Upload one file, attaching it to the todo. Refreshes the detail so the new
// file appears in the list. Caller uploads each selected file in turn.
export function useUploadTodoFile(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadTodoFile(todoId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projectItem(todoId) }),
  })
}

export function useDeleteTodoFile(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fileName: string) => {
      const res = await mobileApi.deleteTodoFile(todoId, fileName)
      if (res.status !== 'ok') throw new Error('Delete failed')
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

// Companies share Brand's management roles — a brand belongs to a company.
export const canManageCompanies = canManageBrands

export function canManageUsers(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

export function canManageBadges(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

// Stations, schedules, holidays, profiles and the daily report. Deliberately
// NOT widened to HR Manager: the report's backend gate is System Manager only
// (api/attendance.py _require_attendance_admin), so HR would get a screen that
// 403s. HR gets canHrApprove instead.
export function canManageAttendance(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

/** Who may cast the final verdict on a cuti / WFH request. Mirrors _is_hr(). */
export function canHrApprove(boot: Boot | undefined): boolean {
  return !!boot && (boot.roles.includes('System Manager') || boot.roles.includes('HR Manager'))
}

// The Vernon roles assignable from the mobile user-management screen.
// Must stay a subset of VERNON_ROLES in api/mobile.py — update_user silently
// drops anything outside that tuple.
export const VERNON_ROLE_OPTIONS = [
  { value: 'Project Owner', label: 'Owner' },
  { value: 'Project Leader', label: 'Leader' },
  { value: 'Project Admin', label: 'Admin' },
  { value: 'Project Team', label: 'Team' },
  { value: 'Points Granter', label: 'Points Granter' },
  { value: 'HR Manager', label: 'HR' },
]

// Member-type marking on a user. '' = external/unset. Must match MEMBER_TYPES in mobile.py.
export const MEMBER_TYPE_OPTIONS = [
  { value: 'Internal Team', label: 'Internal Team' },
  { value: 'Intern', label: 'Intern' },
]

export function useBrands() {
  return useQuery({
    queryKey: keys.brands,
    queryFn: () => resource.list<Brand[]>('Brand', { fields: ['name', 'brand_name', 'company'], limit: 0 }),
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
    mutationFn: (payload: { brand_name: string; company: string }) =>
      resource.create<{ name: string }>('Brand', payload as unknown as Record<string, unknown>),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.brands }),
  })
}

export function useUpdateBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: { company: string } }) =>
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

export function useCompanies() {
  return useQuery({
    queryKey: keys.companies,
    queryFn: () => resource.list<Company[]>('Company', { fields: ['name', 'company_name'], limit: 0 }),
  })
}

export function useCompany(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.company(name),
    queryFn: () => resource.get<Company>('Company', name),
    enabled: !!name && enabled,
  })
}

export function useCreateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { company_name: string }) =>
      resource.create<{ name: string }>('Company', payload as unknown as Record<string, unknown>),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.companies }),
  })
}

export function useDeleteCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Company', name),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.companies }),
  })
}

export function useMergeCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      renameDoc('Company', source, target, true),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.companies })
      qc.invalidateQueries({ queryKey: keys.brands })
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

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (user: string) => mobileApi.deleteUser(user),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.users }),
  })
}

export function useImpersonate() {
  return useMutation({
    mutationFn: (user: string) => mobileApi.impersonate(user),
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
  // refetchOnMount 'always': the wall is visited rarely but must reflect the
  // latest avatars/config each time; a stale cache here showed old user_image
  // snapshots after avatar fixes. Pair with pull-to-refresh on the screen.
  useQuery({ queryKey: keys.teamWall, queryFn: () => mobileApi.getTeamWall() as Promise<TeamWallResponse>, refetchOnMount: 'always' })

export const useMarketplace = () =>
  useQuery({ queryKey: keys.marketplace, queryFn: () => mobileApi.getMarketplace() as Promise<MarketplaceData> })

export const useIncome = () =>
  useQuery({ queryKey: keys.income, queryFn: () => mobileApi.income() as Promise<IncomeData> })

export function useSubmitIncomeClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { opportunity: string; details: string }) =>
      mobileApi.submitIncomeClaim(v.opportunity, v.details),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.income }),
  })
}

export function canManageIncome(boot: Boot | undefined): boolean {
  return !!boot && (
    boot.roles.includes('System Manager') ||
    boot.roles.includes('Income Manager')
  )
}

export const useIncomeManage = () =>
  useQuery({ queryKey: keys.incomeManage, queryFn: () => mobileApi.incomeManage() as Promise<IncomeManageData> })

export function useSaveOpportunity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: Parameters<typeof mobileApi.saveOpportunity>[0]) => mobileApi.saveOpportunity(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.incomeManage })
      qc.invalidateQueries({ queryKey: keys.income })
    },
  })
}

export function useReviewIncomeClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { name: string; status: string; review_note?: string }) =>
      mobileApi.reviewIncomeClaim(v.name, v.status, v.review_note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.incomeManage })
      qc.invalidateQueries({ queryKey: keys.income })
    },
  })
}

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

export function canModerateAds(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-settings'] })
      qc.invalidateQueries({ queryKey: ['home-banners'] })
    },
  })
}

export function useHomeBanners() {
  return useQuery({ queryKey: ['home-banners'], queryFn: () => mobileApi.getHomeBanners() })
}

export function usePreviousShiftShortfall() {
  return useQuery({
    queryKey: ['previous-shift-shortfall'],
    queryFn: () => mobileApi.previousShiftShortfall(),
  })
}

export function useAssignmentOverload(user: string, date: string, addedMinutes: number, enabled: boolean) {
  return useQuery({
    queryKey: ['assignment-overload', user, date, addedMinutes],
    queryFn: () => mobileApi.assignmentOverloadCheck(user, date, addedMinutes),
    enabled: enabled && !!user && !!date && addedMinutes > 0,
    staleTime: 30_000,
  })
}

/** Badge-only: the poll every bell mounts, so it fetches the count and no feed. */
export function useNotifications() {
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => mobileApi.getNotifications(1),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })
}

export const NOTIFICATION_PAGE_SIZE = 150

/**
 * The list itself: first page is the newest 150, "load more" walks back.
 * `enabled` matters — /w keeps the sheet mounted while shut, and 150 rows are
 * not worth fetching for a drawer nobody opened.
 */
export function useNotificationFeed(enabled = true) {
  const q = useInfiniteQuery({
    queryKey: keys.notificationFeed,
    queryFn: ({ pageParam }) => mobileApi.getNotifications(NOTIFICATION_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.has_more ? pages.length * NOTIFICATION_PAGE_SIZE : undefined,
    enabled,
  })
  return {
    ...q,
    items: q.data?.pages.flatMap((p) => p.items) ?? [],
    // Every page carries a fresh global count; the newest one is the truthful one.
    unread: q.data?.pages[0]?.unread ?? 0,
  }
}

export function useAppReleases(platform?: string) {
  return useQuery({
    queryKey: ['app-releases', platform],
    queryFn: () => mobileApi.getAppReleases(platform),
    staleTime: 5 * 60_000,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    // ponytail: one request per name, since a collapsed row marks all its
    // members read. Add a batch endpoint if groups ever get big.
    mutationFn: (names: string | string[]) =>
      Promise.all(
        (Array.isArray(names) ? names : [names]).map((n) => mobileApi.markNotificationRead(n)),
      ),
    onSuccess: () => invalidateNotifications(qc),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => mobileApi.markAllRead(),
    onSuccess: () => invalidateNotifications(qc),
  })
}

/** The badge and the feed are separate queries of the same rows — refresh both. */
function invalidateNotifications(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: keys.notifications })
  qc.invalidateQueries({ queryKey: keys.notificationFeed })
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
    // awardees = who actually attended (gets points). Omit to credit everyone.
    mutationFn: async ({ meeting, awardees }: { meeting: string; awardees?: string[] }) => {
      const res = await mobileApi.markMeetingDone(meeting, awardees)
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

export function useUpdateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fields: Record<string, unknown>) => {
      const res = await mobileApi.updateMeeting(fields)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.meetings }),
  })
}

export function useSetMeetingParticipants() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ meeting, users }: { meeting: string; users: string[] }) => {
      const res = await mobileApi.setMeetingParticipants(meeting, users)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.meetings }),
  })
}

export function useDeleteMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (meeting: string) => {
      const res = await mobileApi.deleteMeeting(meeting)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    // A deleted done-meeting claws back points, so refresh wallet/dashboard too.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.meetings })
      qc.invalidateQueries({ queryKey: keys.wallet })
      qc.invalidateQueries({ queryKey: keys.dashboard })
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

export function useCrateStatus() {
  return useQuery({
    queryKey: keys.crateStatus,
    queryFn: () => mobileApi.getCrateStatus() as Promise<import('../lib/types').CrateStatus>,
  })
}

export function useOpenCrate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => mobileApi.openTaskCrate(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.crateStatus })
      qc.invalidateQueries({ queryKey: keys.avatarCatalog })
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

export function useLinkTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { feedback: string; todo: string }) =>
      mobileApi.linkTask(v.feedback, v.todo),
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
    mutationFn: async (vars: { from_date: string; to_date: string; exception_type: 'WFH' | 'Leave'; reason?: string; leave_type?: string; proof?: string }) => {
      const res = await mobileApi.requestException(vars.from_date, vars.to_date, vars.exception_type, vars.reason, vars.leave_type, vars.proof)
      if (res.status !== 'ok') throw new Error(res.message || 'Request failed')
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.myAttendance })
      qc.invalidateQueries({ queryKey: keys.myExceptions })
    },
  })
}

export function useMyLeaders() {
  return useQuery({
    queryKey: keys.myLeaders,
    queryFn: async () => (await mobileApi.myLeaders()).leaders,
  })
}

export function useLeaveTypes() {
  return useQuery({
    queryKey: ['leave-types'],
    queryFn: async () => (await mobileApi.listLeaveTypes()).types,
  })
}

export function useAdminLeaveTypes() {
  return useQuery({
    queryKey: ['admin-leave-types'],
    queryFn: async () => (await mobileApi.adminListLeaveTypes()).types,
  })
}

export function useSaveLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<LeaveType> & { name?: string }) => mobileApi.saveLeaveType(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-leave-types'] })
      qc.invalidateQueries({ queryKey: ['leave-types'] })
    },
  })
}

export function useDeleteLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => mobileApi.deleteLeaveType(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-leave-types'] })
      qc.invalidateQueries({ queryKey: ['leave-types'] })
    },
  })
}

export function usePendingExceptionApprovals() {
  return useQuery({
    queryKey: keys.pendingExceptionApprovals,
    queryFn: async () => (await mobileApi.pendingExceptionApprovals()).rows,
  })
}

export function useHrPendingExceptions() {
  return useQuery({
    queryKey: keys.hrPendingExceptions,
    queryFn: async () => (await mobileApi.hrPendingExceptions()).rows,
  })
}

export function useMyExceptions() {
  return useQuery({
    queryKey: keys.myExceptions,
    queryFn: async () => (await mobileApi.myExceptions()).rows,
  })
}

function invalidateExceptions(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: keys.pendingExceptionApprovals })
  qc.invalidateQueries({ queryKey: keys.hrPendingExceptions })
  qc.invalidateQueries({ queryKey: keys.myExceptions })
}

export function useApproveException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { name: string; as_hr?: boolean }) => {
      const res = await mobileApi.approveException(vars.name, vars.as_hr)
      if (res.status !== 'ok') throw new Error(res.message || 'Failed')
      return res
    },
    onSettled: () => invalidateExceptions(qc),
  })
}

export function useRejectException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { name: string; reason: string; as_hr?: boolean }) => {
      const res = await mobileApi.rejectException(vars.name, vars.reason, vars.as_hr)
      if (res.status !== 'ok') throw new Error(res.message || 'Failed')
      return res
    },
    onSettled: () => invalidateExceptions(qc),
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

export function useUnderOccupied(fromDate: string, toDate: string, enabled: boolean) {
  return useQuery({
    queryKey: ['under-occupied', fromDate, toDate],
    queryFn: () => mobileApi.underOccupied(fromDate, toDate),
    enabled,
    staleTime: 1000 * 30,
  })
}

export function useTodosDue(dueBy: string, enabled: boolean) {
  return useQuery({
    queryKey: ['todos-due', dueBy],
    queryFn: () => mobileApi.todosDue(dueBy),
    enabled,
    staleTime: 1000 * 30,
  })
}

export function useBuzzTodo() {
  return useMutation({
    mutationFn: (todo: string) => mobileApi.buzzTodo(todo),
  })
}

export const useEvents = () =>
  useQuery({ queryKey: keys.events, queryFn: () => eventsApi.list() })

export const useEvent = (name: string, enabled = true) =>
  useQuery({ queryKey: keys.event(name), queryFn: () => eventsApi.get(name), enabled: !!name && enabled })

export const useMyRegistrations = () =>
  useQuery({ queryKey: keys.myRegistrations, queryFn: () => eventsApi.mine() })

export function useRegisterEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (event: string) => eventsApi.register(event),
    onSettled: (_d, _e, event) => {
      qc.invalidateQueries({ queryKey: keys.events })
      qc.invalidateQueries({ queryKey: keys.event(event) })
      qc.invalidateQueries({ queryKey: keys.myRegistrations })
    },
  })
}

// any authenticated user may manage (create makes them organizer);
// per-event edit/roster/cancel is enforced server-side.
export function canManageEvents(boot: Boot | undefined): boolean {
  return !!boot
}

export const useManagedEvents = () =>
  useQuery({ queryKey: keys.managedEvents, queryFn: () => eventsAdminApi.list() })

export const useManagedEvent = (name: string, enabled = true) =>
  useQuery({ queryKey: keys.managedEvent(name), queryFn: () => eventsAdminApi.get(name), enabled: !!name && enabled })

export function useSaveEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, name }: { payload: EventFormPayload; name?: string }) =>
      eventsAdminApi.save(payload, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.managedEvents })
      qc.invalidateQueries({ queryKey: keys.events })
    },
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => eventsAdminApi.remove(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.managedEvents })
      qc.invalidateQueries({ queryKey: keys.events })
    },
  })
}

export const useEventRoster = (event: string, enabled = true) =>
  useQuery({
    queryKey: keys.eventRoster(event),
    queryFn: () => eventsAdminApi.roster(event),
    enabled: !!event && enabled,
  })

export function useCancelRegistration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => eventsAdminApi.cancelReg(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventRoster'] })
      qc.invalidateQueries({ queryKey: keys.managedEvents })
    },
  })
}

export function useMarkAttended() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, attended }: { name: string; attended: number }) =>
      eventsAdminApi.markAttended(name, attended),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventRoster'] }),
  })
}

// Rooms & Equipment are System-Manager-managed (matches the doctype write perm).
export function canManageResources(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

export function useBookings() {
  return useQuery({
    queryKey: keys.bookings,
    queryFn: () =>
      resource.list<Booking[]>('Resource Booking', {
        fields: ['name', 'title', 'booked_by', 'start', 'end', 'room', 'status'],
        limit: 0,
      }),
  })
}

export function useBooking(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.booking(name),
    queryFn: () => resource.get<Booking>('Resource Booking', name),
    enabled: !!name && enabled,
  })
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      resource.create<{ name: string }>('Resource Booking', payload),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.bookings }),
  })
}

export function useCancelBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      resource.update<{ name: string }>('Resource Booking', name, { status: 'Cancelled' }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.bookings }),
  })
}

export function useRooms() {
  return useQuery({
    queryKey: keys.meetingRooms,
    queryFn: () =>
      resource.list<MeetingRoom[]>('Meeting Room', {
        fields: ['name', 'room_name', 'capacity', 'location', 'is_active'],
        limit: 0,
      }),
  })
}

export function useRoom(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.meetingRoom(name),
    queryFn: () => resource.get<MeetingRoom>('Meeting Room', name),
    enabled: !!name && enabled,
  })
}

export function useCreateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      resource.create<{ name: string }>('Meeting Room', payload),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.meetingRooms }),
  })
}

export function useUpdateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: Record<string, unknown> }) =>
      resource.update<{ name: string }>('Meeting Room', name, payload),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: keys.meetingRooms })
      qc.invalidateQueries({ queryKey: keys.meetingRoom(vars.name) })
    },
  })
}

export function useDeleteRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Meeting Room', name),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.meetingRooms }),
  })
}

export function useEquipment() {
  return useQuery({
    queryKey: keys.equipmentList,
    queryFn: () =>
      resource.list<Equipment[]>('Equipment', {
        fields: ['name', 'equipment_name', 'category', 'is_active'],
        limit: 0,
      }),
  })
}

export function useEquipmentItem(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.equipmentItem(name),
    queryFn: () => resource.get<Equipment>('Equipment', name),
    enabled: !!name && enabled,
  })
}

export function useCreateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      resource.create<{ name: string }>('Equipment', payload),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.equipmentList }),
  })
}

export function useUpdateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: Record<string, unknown> }) =>
      resource.update<{ name: string }>('Equipment', name, payload),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: keys.equipmentList })
      qc.invalidateQueries({ queryKey: keys.equipmentItem(vars.name) })
    },
  })
}

export function useDeleteEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Equipment', name),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.equipmentList }),
  })
}

export function useCheckAvailability() {
  return useMutation({ mutationFn: checkAvailability })
}

export function useEmployeeProfile(user: string, enabled = true) {
  return useQuery({
    queryKey: keys.employeeProfile(user),
    queryFn: () => mobileApi.getEmployeeProfile(user),
    enabled: !!user && enabled,
  })
}

export function useSaveMyProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<import('@/lib/types').EmployeeSoft>) =>
      mobileApi.updateMyProfile(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.boot }),
  })
}

export const useAds = (adType?: string, q?: string, mine?: boolean) =>
  useQuery({ queryKey: keys.ads(adType, q, mine), queryFn: () => papanApi.list(adType, q, mine) })

export const useAd = (name: string) =>
  useQuery({ queryKey: keys.ad(name), queryFn: () => papanApi.get(name), enabled: !!name })

export function useSaveAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, name }: { payload: AdPayload; name?: string }) =>
      name ? papanApi.update(name, payload) : papanApi.create(payload),
    onSuccess: (_d, { name }) => {
      qc.invalidateQueries({ queryKey: ['ads'] })
      if (name) qc.invalidateQueries({ queryKey: keys.ad(name) })
    },
  })
}

export function useSetAdStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { name: string; status: string }) => papanApi.setStatus(v.name, v.status),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['ads'] })
      qc.invalidateQueries({ queryKey: keys.ad(v.name) })
    },
  })
}

export function useDeleteAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => papanApi.remove(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads'] }),
  })
}

export function useAdminRemoveAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { name: string; reason: string }) => papanApi.adminRemove(v.name, v.reason),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['ads'] })
      qc.invalidateQueries({ queryKey: keys.ad(v.name) })
    },
  })
}

export const useAdBans = () =>
  useQuery({ queryKey: keys.adBans, queryFn: () => papanApi.bans() })

export function useBanUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { user: string; banned_until: string; reason: string }) =>
      papanApi.ban(v.user, v.banned_until, v.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.adBans }),
  })
}

export function useUnbanUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (user: string) => papanApi.unban(user),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.adBans }),
  })
}

export function useCatalog() {
  return useQuery({ queryKey: keys.lmsCatalog, queryFn: () => lmsApi.catalog() })
}
export function useCourse(name: string) {
  return useQuery({ queryKey: keys.lmsCourse(name), queryFn: () => lmsApi.course(name), enabled: !!name })
}
export function useMyLearning() {
  return useQuery({ queryKey: keys.lmsMine, queryFn: () => lmsApi.myLearning() })
}
export function useManageCourses() {
  return useQuery({ queryKey: keys.lmsManage, queryFn: () => lmsApi.manageCourses() })
}
export function useCourseReport(course: string) {
  return useQuery({ queryKey: keys.lmsReport(course), queryFn: () => lmsApi.courseReport(course), enabled: !!course })
}
export function useAssignableUsers() {
  return useQuery({ queryKey: keys.lmsAssignable, queryFn: () => lmsApi.assignableUsers() })
}
export function useEnroll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (course: string) => lmsApi.enroll(course),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.lmsCatalog }); qc.invalidateQueries({ queryKey: keys.lmsMine }) },
  })
}
export function useCompleteLesson(courseName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ course, lesson }: { course: string; lesson: string }) => lmsApi.completeLesson(course, lesson),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.lmsCourse(courseName) })
      qc.invalidateQueries({ queryKey: keys.lmsMine })
      qc.invalidateQueries({ queryKey: keys.lmsCatalog })
    },
  })
}
export function useSaveCourse() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (v: Record<string, unknown>) => lmsApi.saveCourse(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.lmsManage })
      qc.invalidateQueries({ queryKey: keys.lmsCatalog })
    }
  })
}
export function useSaveLesson(courseName: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (v: Record<string, unknown>) => lmsApi.saveLesson(v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.lmsCourse(courseName) }); qc.invalidateQueries({ queryKey: keys.lmsManage }) } })
}
export function useDeleteLesson(courseName: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (name: string) => lmsApi.deleteLesson(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.lmsCourse(courseName) }); qc.invalidateQueries({ queryKey: keys.lmsManage }) } })
}
export function useDeleteCourse() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (name: string) => lmsApi.deleteCourse(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.lmsManage }) })
}
export function useAssignCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ course, users, due_date }: { course: string; users: string[]; due_date?: string }) =>
      lmsApi.assignCourse(course, users, due_date),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.lmsReport(v.course) }),
  })
}
export function canManageLms(boot: Boot | undefined): boolean {
  // mirrors canManageIncome: boot.roles is the real accessor (Boot.roles: string[])
  return !!boot && (
    boot.roles.includes('System Manager') ||
    boot.roles.includes('LMS Manager')
  )
}

export function useLogbook(from_date: string, to_date: string, user: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.logbook(from_date, to_date, user),
    queryFn: () => mobileApi.logbook(from_date, to_date, user),
    enabled,
    staleTime: 1000 * 30,
  })
}

export function useWebsiteSettings() {
  return useQuery({
    queryKey: keys.websiteSettings,
    queryFn: async () => {
      const r = await mobileApi.websiteBranding()
      return { appName: r.app_name ?? '', logoUrl: r.app_logo || null } as import('@/lib/types').WebsiteBranding
    },
    staleTime: 1000 * 60 * 60, // ponytail: 1h — branding rarely changes
  })
}

// ---- Leaders & Notes (person→person supervision + observations) ----

export const useUserNotes = (user: string) =>
  useQuery({
    queryKey: keys.userNotes(user),
    queryFn: () => mobileApi.listUserNotes(user),
    enabled: !!user,
  })

export const useUserLeaders = (user: string) =>
  useQuery({
    queryKey: keys.userLeaders(user),
    queryFn: () => mobileApi.getUserLeaders(user),
    enabled: !!user,
  })

export const useLedUsers = () =>
  useQuery({ queryKey: keys.ledUsers, queryFn: () => mobileApi.listLedUsers() })

export function useAddUserNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { user: string; body: string; note_date?: string | null; shared_with_user?: 0 | 1 }) =>
      mobileApi.addUserNote(args),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.userNotes(v.user) }),
  })
}

export function useDeleteUserNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { name: string; user: string }) => mobileApi.deleteUserNote(args.name),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.userNotes(v.user) }),
  })
}

// ---- Superpowers (self-claimed + peer-voted traits, admin settings) ----

export const useSuperpowers = () =>
  useQuery({ queryKey: keys.superpowers, queryFn: () => mobileApi.listSuperpowers() })

export const useUserSuperpowers = (user: string) =>
  useQuery({
    queryKey: keys.userSuperpowers(user),
    queryFn: () => mobileApi.getUserSuperpowers(user),
    enabled: !!user,
  })

export const useSuperpowerSettings = () =>
  useQuery({ queryKey: keys.superpowerSettings, queryFn: () => mobileApi.getSuperpowerSettings() })

export function useSetMySuperpowers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ user, superpowers }: { user: string; superpowers: string[] }) =>
      mobileApi.setMySuperpowers(user, superpowers),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.userSuperpowers(v.user) }),
  })
}

export function useCastVote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ratee, superpower, score }: { ratee: string; superpower: string; score: number }) =>
      mobileApi.castVote(ratee, superpower, score),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.userSuperpowers(v.ratee) }),
  })
}

export function useRemoveVote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ratee, superpower }: { ratee: string; superpower: string }) =>
      mobileApi.removeVote(ratee, superpower),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.userSuperpowers(v.ratee) }),
  })
}

export function useSaveSuperpowerSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: Parameters<typeof mobileApi.saveSuperpowerSettings>[0]) =>
      mobileApi.saveSuperpowerSettings(s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.superpowerSettings })
      qc.invalidateQueries({ queryKey: keys.superpowers })
    },
  })
}

export function useSaveSuperpower() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Parameters<typeof mobileApi.saveSuperpower>[0]) => mobileApi.saveSuperpower(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.superpowers }),
  })
}

export function useDeleteSuperpower() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => mobileApi.deleteSuperpower(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.superpowers }),
  })
}

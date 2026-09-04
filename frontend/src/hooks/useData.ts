import { useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { api, mobileApi, resource, renameDoc, passkeyApi, eventsApi, eventsAdminApi, checkAvailability, papanApi, lmsApi, uploadTodoFile, habitApi, certificateApi } from '@/lib/api'
import { useToast } from '@/components/Toast'
import { stopTimer } from '@/hooks/useFocusTimer'
import { enrollPasskey } from '@/lib/webauthn'
import { allocTotal } from '@/lib/planDay'
import { todayISO, effectivePoints } from '@/lib/format'
import { patchTodoInCache } from '@/lib/patchTodoCache'
import { BRAND_WEEKDAY_KEYS } from '@/lib/types'
import type {
  AppSettings,
  AvatarCatalog,
  Boot,
  Brand,
  BusinessUnit,
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
  TeamPriorityCoverage,
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
  HabitsResponse,
  ChecklistItem,
  AiPrompt,
} from '@/lib/types'

export type { ChecklistItem }
import type { GanttGroup } from '@/lib/gantt'

type BrandWeekdayPayload = Partial<Record<(typeof BRAND_WEEKDAY_KEYS)[number], number>>

export const keys = {
  boot: ['boot'] as const,
  dashboard: ['dashboard'] as const,
  calendar: ['calendar'] as const,
  planPool: ['calendar', 'open'] as const,
  dailyTargets: (from: string, to: string) => ['daily-targets', from, to] as const,
  priorityOccupancy: (users: string[], date: string) =>
    ['priority-occupancy', date, [...users].sort().join(',')] as const,
  teamPriorityCoverage: (project: string, weekStart: string) =>
    ['team-priority-coverage', project, weekStart] as const,
  projects: ['projects'] as const,
  project: (n: string) => ['project', n] as const,
  projectGantt: (n: string) => ['project-gantt', n] as const,
  projectBlueprint: (n: string) => ['project-blueprint', n] as const,
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
  businessUnits: ['business-units'] as const,
  businessUnit: (n: string) => ['business-unit', n] as const,
  users: ['users'] as const,
  wallet: ['wallet'] as const,
  walletLog: ['wallet-log'] as const,
  userPointsLog: (user: string) => ['user-points-log', user] as const,
  leaderboard: (period: string, brand: string | null) =>
    ['leaderboard', period, brand ?? ''] as const,
  marketplace: ['marketplace'] as const,
  income: ['income'] as const,
  incomeManage: ['income-manage'] as const,
  announcements: ['announcements'] as const,
  announcementsManage: ['announcements-manage'] as const,
  rewardsAdmin: ['rewards-admin'] as const,
  rewardAdmin: (n: string) => ['reward-admin', n] as const,
  redemptionsAdmin: (s: string) => ['redemptions-admin', s] as const,
  giftRecipients: ['gift-recipients'] as const,
  notifications: ['notifications'] as const,
  redemptionNotice: ['redemption-notice'] as const,
  unreadMentions: ['unread-mentions'] as const,
  notificationFeed: ['notification-feed'] as const,
  foodInvitesPending: ['food-invites-pending'] as const,
  foodInvite: (n: string) => ['food-invite', n] as const,
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
  superpowerWall: ['superpower-wall'] as const,
  superpowerProgress: (user: string) => ['superpower-progress', user] as const,
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
  userNotes: (user: string, project?: string) => ['user-notes', user, project ?? null] as const,
  superpowers: ['superpowers'] as const,
  votableUsers: ['votable-users'] as const,
  userSuperpowers: (user: string) => ['user-superpowers', user] as const,
  superpowerSettings: ['superpower-settings'] as const,
  recognitionGate: ['recognition-gate'] as const,
  discReminder: ['disc-reminder'] as const,
  myDisc: ['my-disc'] as const,
  photoGate: ['photo-gate'] as const,
  habits: ['habits'] as const,
  myApprovals: ['my-approvals'] as const,
  recentlyDone: ['recently-done'] as const,
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

// Plan pool: open todos assigned to me or in a project I lead/own — exactly what
// the Plan screens' "My work" / "My project" toggles keep. Skips the completed
// backlog AND everyone else's work server-side (a System Manager's full visible set
// is the whole org; the plan page never shows it). Much smaller payload.
export const usePlanPool = () =>
  useQuery({
    queryKey: keys.planPool,
    queryFn: () => mobileApi.calendar(true, true) as Promise<{ todos: ProjectItem[] }>,
  })

// Per-date daily-minimum minutes over an inclusive range — the plan screen's
// day-load targets. Disabled until both dates are set.
export const useDailyTargets = (from: string, to: string) =>
  useQuery({
    queryKey: keys.dailyTargets(from, to),
    queryFn: () => mobileApi.getDailyTargets(from, to),
    enabled: !!from && !!to,
  })

// Priority-slot occupancy for one or more users on one date — powers the homepage rail's
// day filter (self) and the Plan screen's leader occupancy badge (a teammate). `enabled`
// lets callers skip the request entirely for the common case (today's data is already
// loaded elsewhere).
export const usePriorityOccupancy = (users: string[], date: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.priorityOccupancy(users, date),
    queryFn: () => mobileApi.priorityOccupancy(users, date),
    enabled: enabled && users.length > 0 && !!date,
  })

// A project's whole team, one week's priority-slot fill status per person per day —
// powers the Plan screen's "Tim" mode. Disabled until a project is actually selected.
export const useTeamPriorityCoverage = (project: string, weekStart: string) =>
  useQuery({
    queryKey: keys.teamPriorityCoverage(project, weekStart),
    queryFn: () => mobileApi.teamPriorityCoverage(project, weekStart),
    enabled: !!project && !!weekStart,
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

export const useProjectBlueprint = (name: string, enabled = true) =>
  useQuery({
    queryKey: keys.projectBlueprint(name),
    queryFn: () => mobileApi.projectBlueprint(name) as Promise<import('@/lib/blueprint').BlueprintData>,
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
    // Flip the acted card immediately from the server's authoritative result, so it's
    // already fresh when the dialog closes — no stale "stuck" window, and no waiting
    // on the six refetches below (which were the real perceived latency).
    onSuccess: (res, todoId) => {
      if (!res.status_key) return
      qc.setQueriesData({ predicate: () => true }, (old: unknown) =>
        patchTodoInCache(old, todoId, {
          status_key: res.status_key,
          next_status_label: res.next_status_label ?? null,
          can_advance: res.can_advance ?? false,
        }),
      )
    },
    // Reconcile rollups/siblings in the background. Deliberately NOT awaited: the card
    // is already correct from onSuccess, so `isPending` clears right after the write
    // instead of after the refetch round-trips.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
      qc.invalidateQueries({ queryKey: keys.recentlyDone })
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
    qc.invalidateQueries({ queryKey: keys.calendar })
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
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
      qc.invalidateQueries({ queryKey: keys.recentlyDone })
    },
  })
}

// Approvals the current user has personally granted (Leader/Owner gate),
// newest first — powers the "My Approvals" history screen.
export const useMyApprovals = () =>
  useQuery({
    queryKey: keys.myApprovals,
    queryFn: () => mobileApi.myApprovals(),
  })

// The current user's own last 30 completed todos, newest first — powers the
// Home "Done" tab. Invalidated by useAdvanceStatus/useRejectStatus/useUndoApproval
// (all three can move a todo into or out of Completed) so the tab and its badge
// count stay live.
export const useRecentlyDone = () =>
  useQuery({
    queryKey: keys.recentlyDone,
    queryFn: () => mobileApi.recentlyDone(),
  })

// Undo the current user's own most recent approval gate, one step back.
// Invalidates the same queries as a reject so every affected list refreshes.
export function useUndoApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (todoId: string) => {
      const res = await mobileApi.undoApproval(todoId)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.myApprovals })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
      qc.invalidateQueries({ queryKey: keys.recentlyDone })
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
      qc.invalidateQueries({ queryKey: keys.calendar })
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
      qc.invalidateQueries({ queryKey: keys.calendar })
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
      qc.invalidateQueries({ queryKey: keys.calendar })
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

export const useLastSeenAccess = () =>
  useQuery({
    queryKey: ['last-seen-access'],
    queryFn: () => mobileApi.lastSeenAccess(),
    staleTime: 1000 * 60 * 5,
  })

export const useInternAllocationAccess = () =>
  useQuery({
    queryKey: ['intern-allocation-access'],
    queryFn: () => mobileApi.internAllocationAccess(),
    staleTime: 1000 * 60 * 5,
  })

export const useInternAllocation = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: ['intern-allocation', from, to],
    queryFn: () => mobileApi.internAllocation(from, to),
    enabled,
    staleTime: 1000 * 30,
  })

// --- internship certificates ---------------------------------------------------------

export const useCertificateAccess = () =>
  useQuery({
    queryKey: ['certificate-access'],
    queryFn: () => certificateApi.certificateAccess(),
    staleTime: 1000 * 60 * 5,
  })

export const useCertificates = (params?: { intern?: string; status?: string }, enabled = true) =>
  useQuery({
    queryKey: ['certificates', params?.intern ?? '', params?.status ?? ''],
    queryFn: () => certificateApi.listCertificates(params),
    enabled,
    staleTime: 1000 * 30,
  })

export const useIssuableInterns = (enabled = true) =>
  useQuery({
    queryKey: ['certificate-interns'],
    queryFn: () => certificateApi.issuableInterns(),
    enabled,
    staleTime: 1000 * 60 * 5,
  })

export const useMyScore = () =>
  useQuery({
    queryKey: ['my-intern-score'],
    queryFn: () => certificateApi.myScore(),
    staleTime: 1000 * 60,
  })

export const useCertificate = (name: string | undefined) =>
  useQuery({
    queryKey: ['certificate', name],
    queryFn: () => certificateApi.getCertificate(name!),
    enabled: !!name,
    // A draft recomputes its auto score on every read, so never serve a stale one.
    staleTime: 0,
  })

export const usePreviewScore = (
  intern: string | undefined, from: string, to: string, project?: string, enabled = true,
) =>
  useQuery({
    queryKey: ['certificate-preview', intern ?? '', from, to, project ?? ''],
    queryFn: () => certificateApi.previewScore(intern!, from, to, project),
    enabled: enabled && !!intern && !!from && !!to,
    staleTime: 1000 * 30,
  })

export const useSaveCertificate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof certificateApi.saveCertificate>[0]) =>
      certificateApi.saveCertificate(payload),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['certificates'] })
      qc.setQueryData(['certificate', doc.name], doc)
    },
  })
}

export const useSetCertificateStatus = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, target, reason }: { name: string; target: string; reason?: string }) =>
      certificateApi.setCertificateStatus(name, target, reason),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['certificates'] })
      qc.setQueryData(['certificate', doc.name], doc)
    },
  })
}

export const useLastSeenReport = (enabled = true) =>
  useQuery({
    queryKey: ['last-seen'],
    queryFn: () => mobileApi.lastSeenReport(),
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
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.projects })
    },
  })
}

// Set a todo's `blocking` list (dependency edges). The controller mirrors the
// other side, so one write suffices. Used by the blueprint whiteboard's
// drag-to-connect / edge-remove. Invalidates the blueprint + calendar caches.
export function useSetTodoBlocking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ todo, blocking }: { todo: string; blocking: string[] }) => {
      const res = await mobileApi.updateTodo(todo, { blocking })
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project-blueprint'] })
      qc.invalidateQueries({ queryKey: keys.calendar })
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
      qc.invalidateQueries({ queryKey: keys.calendar })
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
  const toast = useToast()
  return useMutation({
    mutationFn: async (allocations: { date: string; minutes: number; note?: string }[]) => {
      const res = await mobileApi.setTodoAllocations(todoId, allocations)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    // Flip the "Today" chip instantly across every cache shape instead of waiting on
    // the ~200ms save AND the calendar/dashboard refetches below — that round-trip was
    // the "clicking Today is very slow". Mirrors useAdvanceStatus's optimistic patch.
    onMutate: (allocations) => {
      const todayMin = allocations.find((a) => a.date === todayISO())?.minutes ?? 0
      qc.setQueriesData({ predicate: () => true }, (old: unknown) =>
        patchTodoInCache(old, todoId, { today_allocation: todayMin }),
      )
    },
    onError: (e) => toast('error', (e as Error).message || 'Could not update today’s plan'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projectItem(todoId) })
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      // Project Detail / workspace todo tables render today_allocation too — refetch
      // so the "Today" toggle turns green there, not only on the dashboard.
      qc.invalidateQueries({ queryKey: ['project-detail'] })
    },
  })
}

// Optimistically move a todo to its new board column in the calendar cache (the
// board's read source) so it re-buckets the instant it's tapped, and return the
// pre-move snapshot for rollback. Without this the card sat frozen through a
// POST *and* a full calendar refetch — two serial round-trips — before it moved.
// `fields` = whatever changes the todo's column: allocations for the alloc board,
// deadline for the deadline board.
async function optimisticCalendarMove(
  qc: QueryClient,
  todoName: string,
  fields: Partial<ProjectItem>,
) {
  await qc.cancelQueries({ queryKey: keys.calendar })
  const prev = qc.getQueryData<{ todos: ProjectItem[] }>(keys.calendar)
  qc.setQueryData<{ todos: ProjectItem[] }>(keys.calendar, (old) =>
    old ? { todos: old.todos.map((t) => (t.name === todoName ? { ...t, ...fields } : t)) } : old,
  )
  return prev
}

// Move a todo's whole plan onto a single date (the "By project" board's
// drag/tap-to-move), or clear it when date is null. Replaces ALL existing
// allocation rows — collapsing a multi-date plan to the one dropped date.
// Minutes carried over: the todo's existing total, else its estimate (else 30).
// Optimistic: the card jumps columns at once; calendar/dashboard/detail reconcile
// on settle, and a failed write rolls the card back to where it was.
export function useMoveTodoPlan() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ todo, date }: { todo: ProjectItem; date: string | null }) => {
      const minutes = allocTotal(todo) || (todo.estimated > 0 ? todo.estimated : 30)
      const res = await mobileApi.setTodoAllocations(todo.name, date ? [{ date, minutes }] : [])
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onMutate: ({ todo, date }) => {
      const minutes = allocTotal(todo) || (todo.estimated > 0 ? todo.estimated : 30)
      return optimisticCalendarMove(qc, todo.name, { allocations: date ? [{ date, minutes }] : [] })
    },
    onError: (e, _vars, prev) => {
      if (prev) qc.setQueryData(keys.calendar, prev)
      toast('error', (e as Error).message || 'Could not move the task')
    },
    onSettled: (_res, _err, vars) => {
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projectItem(vars.todo.name) })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
    },
  })
}

// "Plan my project" board move: a leader/owner drops a todo on a day to set its
// DEADLINE to that date (null → clear it, back to Unscheduled). Mirrors
// useMoveTodoPlan but writes `deadline` via update_todo (permitted for
// leader/owner/assignee) instead of the assignee-only allocation split.
export function useMoveTodoDeadline() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ todo, date }: { todo: ProjectItem; date: string | null }) => {
      const res = await mobileApi.updateTodo(todo.name, { deadline: date ?? '' })
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onMutate: ({ todo, date }) => optimisticCalendarMove(qc, todo.name, { deadline: date }),
    onError: (e, _vars, prev) => {
      if (prev) qc.setQueryData(keys.calendar, prev)
      toast('error', (e as Error).message || 'Could not move the task')
    },
    onSettled: (_res, _err, vars) => {
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projectItem(vars.todo.name) })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
    },
  })
}

// Toggle is_priority on an arbitrary todo. Unlike useUpdateTodo (bound to one todo id at hook
// call time), this takes the todo name as a mutation variable — needed because
// PlanDeadlineDay renders a LIST of todos and can't call a hook once per row.
export function useSetTodoPriority() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ todoName, isPriority }: { todoName: string; isPriority: boolean }) => {
      const res = await mobileApi.updateTodo(todoName, { is_priority: isPriority ? 1 : 0 })
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onError: (e) => toast('error', (e as Error).message || 'Could not update priority'),
    onSettled: (_res, _err, vars) => {
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projectItem(vars.todoName) })
      qc.invalidateQueries({ queryKey: ['priority-occupancy'] })
      qc.invalidateQueries({ queryKey: ['team-priority-coverage'] })
    },
  })
}

// Set Work Mode (Human/AI/Both, '' clears) on an arbitrary todo — same list-context
// reason as useSetTodoPriority (menu renders per-row, can't call a hook per row).
export function useSetTodoWorkMode() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ todoName, workMode }: { todoName: string; workMode: 'Human' | 'AI' | 'Both' | '' }) => {
      const res = await mobileApi.updateTodo(todoName, { work_mode: workMode })
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onError: (e) => toast('error', (e as Error).message || 'Could not update work mode'),
    onSettled: (_res, _err, vars) => {
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projectItem(vars.todoName) })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
    },
  })
}

// Toggle the assignee's "To Check" reminder flag from a list context (same per-row
// reason as useSetTodoPriority). Plain flag — no scoring/workflow effect.
export function useSetTodoCheck() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ todoName, toCheck }: { todoName: string; toCheck: boolean }) => {
      const res = await mobileApi.updateTodo(todoName, { to_check: toCheck ? 1 : 0 })
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onError: (e) => toast('error', (e as Error).message || 'Could not update To Check'),
    onSettled: (_res, _err, vars) => {
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projectItem(vars.todoName) })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
    },
  })
}

// Quick check-handoff: create a follow-up todo for someone else, mark mine Done.
export function useFollowUpCheck() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({
      todoId,
      assignee,
      note,
      estimated,
      group,
      levelId,
      deadline,
    }: {
      todoId: string
      assignee: string
      note?: string
      estimated?: number
      group?: string
      levelId?: string
      deadline?: string
    }) => mobileApi.followUpCheck(todoId, assignee, { note, estimated, group, levelId, deadline }),
    onError: (e) => toast('error', (e as Error).message || 'Gagal membuat tindak lanjut'),
    onSuccess: (_res, vars) => {
      stopTimer(vars.todoId) // hand-off marks the source Done → drop its focus timer here too
      toast('success', 'Tindak lanjut dikirim ke rekanmu')
    },
    onSettled: (_res, _err, vars) => {
      qc.invalidateQueries({ queryKey: keys.calendar })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projectItem(vars.todoId) })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
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
      qc.invalidateQueries({ queryKey: keys.calendar })
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
      qc.invalidateQueries({ queryKey: keys.calendar }) // refresh the plan board on new task
    },
  })
}

/**
 * Bulk-create todos one at a time so the caller can show a real progress bar.
 * Rows insert top-to-bottom; a blocked_by entry of "#<i>" depends on the i-th
 * row IN THIS batch (earlier rows only) and resolves to the just-created name,
 * so tasks can be chained. A failed row is skipped and any later ref to it is
 * dropped. Each insert runs the normal create-permission + scoring controller.
 */
export function useCreateProjectItems(projectDetail: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ shared, rows, onProgress }: {
      shared: Record<string, unknown>
      rows: { to_do: string; notes?: string; blocked_by?: string[] }[]
      onProgress?: (done: number, total: number) => void
    }) => {
      const created: (string | null)[] = [] // per-row created name, null if it failed
      const names: string[] = []
      const failed: { to_do: string; error: string }[] = []
      onProgress?.(0, rows.length)
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const blocked = (row.blocked_by ?? [])
          .map((b) => (b.startsWith('#') ? created[Number(b.slice(1))] : b))
          .filter((x): x is string => !!x)
          .map((todo) => ({ todo }))
        try {
          const doc = (await mobileApi.createTask({
            project_detail: projectDetail,
            ...shared,
            to_do: row.to_do,
            notes: row.notes ?? '',
            blocked_by: blocked,
          })) as { name: string }
          created.push(doc.name)
          names.push(doc.name)
        } catch (e) {
          created.push(null)
          failed.push({ to_do: row.to_do, error: (e as Error).message })
        }
        onProgress?.(i + 1, rows.length)
      }
      return { created: names, failed }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projectDetail(projectDetail) })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.calendar }) // refresh the plan board on new task
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

export function useSaveAiPrompt(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (prompts: AiPrompt[]) => {
      const res = await mobileApi.saveAiPrompt(todoId, JSON.stringify(prompts))
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projectItem(todoId) }),
  })
}

export function useSaveChecklist(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: ChecklistItem[]) => {
      const res = await mobileApi.saveChecklist(todoId, JSON.stringify(items))
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
  const isAdmin = !!me && (project.project_admins ?? []).includes(me)
  return {
    can_edit: isSM || isOwner || isLeader,
    can_delete: isSM || isOwner || isLeader || isAdmin,
    can_reassign: isSM || isOwner,
    // Meetings: Admin manages them too (matches Meeting doctype has_permission),
    // unlike can_edit which stays owner/leader-only.
    can_manage_meetings: isSM || isOwner || isLeader || isAdmin,
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
    mutationFn: (project: string) => mobileApi.deleteProject(project),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export interface BulkAssignProjectRolesArgs {
  projects: string[]
  set_leader?: boolean
  leader?: string | null
  admins?: string[]
  admin_mode?: 'add' | 'replace'
}

export function useBulkAssignProjectRoles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: BulkAssignProjectRolesArgs) =>
      api.post<{ updated: string[]; skipped: { name: string; reason: string }[] }>(
        'vernon_project.api.project_roles.bulk_assign_project_roles',
        {
          projects: JSON.stringify(args.projects),
          set_leader: args.set_leader ? 1 : 0,
          ...(args.leader ? { leader: args.leader } : {}),
          admins: JSON.stringify(args.admins ?? []),
          admin_mode: args.admin_mode ?? 'add',
        },
      ),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
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
    mutationFn: (name: string) => mobileApi.deleteProjectDetail(name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

// Promote a Project Detail into its own Project (owner/leader/admins copied)
// and move the detail — with its todos — into it. Returns the new project name
// so the caller can navigate.
export function usePromoteProjectDetail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (project_detail: string) => mobileApi.promoteProjectDetail(project_detail),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
    },
  })
}

export function useMoveDestinations(project_detail: string) {
  return useQuery({
    queryKey: ['move-destinations', project_detail],
    queryFn: () => mobileApi.moveDestinations(project_detail),
    enabled: !!project_detail,
  })
}

export function useMoveProjectDetail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { project_detail: string; destination_project: string }) =>
      mobileApi.moveProjectDetail(vars.project_detail, vars.destination_project),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

// Move todos into another detail of the same project. Broad invalidation: the
// source + destination details and the project board all shift at once.
export function useMoveTodos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { destination: string; todoIds: string[] }) =>
      mobileApi.moveTodos(vars.destination, vars.todoIds),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: keys.projects })
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

export function useEditComment(refDoctype: string, refName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      mobileApi.editComment(name, content),
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

// Flat catalog of every Group Level row across all groups — powers the combined
// "[Group] Type - Level" single-select picker. One cached fetch for all forms.
export function useGroupLevels() {
  return useQuery({
    queryKey: ['group-levels'],
    queryFn: () => mobileApi.getGroupLevels(),
    staleTime: 5 * 60 * 1000,
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

// Business Units share the same management roles.
export const canManageBusinessUnits = canManageBrands

export function canManageUsers(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

export function canManageBadges(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

// Bare System-Manager check (e.g. testing-only screens).
export function isSystemManager(boot: Boot | undefined): boolean {
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

/** Who may post job openings and manage applications / blacklist. Mirrors _require_hr(). */
export function canManageRecruitment(boot: Boot | undefined): boolean {
  return !!boot && (boot.roles.includes('System Manager') || boot.roles.includes('HR Manager'))
}

/** Anyone who can reach at least one admin tool — gates the /hr "HR Management" hub. */
export function canSeeHrHub(boot: Boot | undefined): boolean {
  return (
    canManageUsers(boot) || canHrApprove(boot) || canManageAttendance(boot) ||
    canManageRecruitment(boot) || canManageBadges(boot) || canManageCompanies(boot) ||
    canManageBrands(boot) || canManageBusinessUnits(boot) || canManageIncome(boot) ||
    canManageLms(boot) || canManageGroups(boot) || canManageResources(boot)
  )
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
    mutationFn: (payload: { brand_name: string; company: string } & BrandWeekdayPayload) =>
      resource.create<{ name: string }>('Brand', payload as unknown as Record<string, unknown>),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.brands }),
  })
}

export function useUpdateBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: { company?: string } & BrandWeekdayPayload }) =>
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

export function useBusinessUnits() {
  return useQuery({
    queryKey: keys.businessUnits,
    queryFn: () =>
      resource.list<BusinessUnit[]>('Business Unit', {
        fields: ['name', 'business_unit_name', 'company', 'description', 'image', 'logo'],
        limit: 0,
      }),
  })
}

export function useBusinessUnit(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.businessUnit(name),
    queryFn: () => resource.get<BusinessUnit>('Business Unit', name),
    enabled: !!name && enabled,
  })
}

export function useCreateBusinessUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      business_unit_name: string
      company: string | null
      description: string | null
      image: string | null
      logo: string | null
    }) => resource.create<{ name: string }>('Business Unit', payload as unknown as Record<string, unknown>),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.businessUnits }),
  })
}

export function useUpdateBusinessUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: { company: string | null; description: string | null; image: string | null; logo: string | null } }) =>
      resource.update<{ name: string }>('Business Unit', name, payload as unknown as Record<string, unknown>),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: keys.businessUnits })
      qc.invalidateQueries({ queryKey: keys.businessUnit(vars.name) })
    },
  })
}

export function useDeleteBusinessUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Business Unit', name),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.businessUnits }),
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

// Transparent earned-points log for any user (opened from the leaderboard).
export const useUserPointsLog = (user?: string) =>
  useQuery({
    queryKey: keys.userPointsLog(user ?? ''),
    queryFn: () => mobileApi.getUserPointsLog(user!),
    enabled: !!user,
  })

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

export const useSuperpowerWall = () =>
  useQuery({
    queryKey: keys.superpowerWall,
    queryFn: () => mobileApi.getSuperpowerWall() as Promise<import('@/lib/types').SuperpowerWallResponse>,
    refetchOnMount: 'always',
  })

export const useSuperpowerProgress = (user: string) =>
  useQuery({
    queryKey: keys.superpowerProgress(user),
    queryFn: () => mobileApi.getSuperpowerProgress(user) as Promise<import('@/lib/types').SuperpowerProgressView>,
    enabled: !!user,
  })

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

/** Who may create/manage the top-of-page announcement ticker. Mirrors MANAGE_ROLES
 *  in api/announcement.py. */
export function canManageAnnouncements(boot: Boot | undefined): boolean {
  return !!boot && (boot.roles.includes('System Manager') || boot.roles.includes('HR Manager'))
}

/** Active announcements for the ticker. Polls so a long-open tab picks up newly
 *  published / expired ones without a reload. */
export const useActiveAnnouncements = () =>
  useQuery({
    queryKey: keys.announcements,
    queryFn: () => mobileApi.activeAnnouncements(),
    refetchInterval: 5 * 60_000,
  })

export const useAnnouncementsAdmin = () =>
  useQuery({ queryKey: keys.announcementsManage, queryFn: () => mobileApi.listAnnouncements() })

export function useSaveAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: Parameters<typeof mobileApi.saveAnnouncement>[0]) => mobileApi.saveAnnouncement(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.announcementsManage })
      qc.invalidateQueries({ queryKey: keys.announcements })
    },
  })
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => mobileApi.deleteAnnouncement(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.announcementsManage })
      qc.invalidateQueries({ queryKey: keys.announcements })
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
    queryFn: async () => {
      const rows = await resource.list<AdminReward[]>('Marketplace Reward', {
        fields: ['name', 'reward_name', 'point_cost', 'discounted_points', 'stock_quantity', 'active', 'image'],
        limit: 0,
      })
      // Default the admin list cheapest-first by effective (promo-aware) price.
      return [...rows].sort((a, b) => effectivePoints(a) - effectivePoints(b))
    },
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
    // save_reward owns create + update+rename atomically server-side.
    mutationFn: (payload: RewardFormPayload) => mobileApi.saveReward(payload),
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
      mobileApi.saveReward(payload, name),
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

/** Manager-only badge: unresolved marketplace redemptions. Poll-safe for all
 * users (non-managers get count 0), so every bell can mount it. */
export function useRedemptionNotice() {
  return useQuery({
    queryKey: keys.redemptionNotice,
    queryFn: () => mobileApi.redemptionNotice(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  })
}

/** Home-screen surface: the session user's unread @-mentions, so a mention
 * can't hide behind the notification wall. Poll-safe for everyone (no mentions → count 0). */
export function useUnreadMentions() {
  return useQuery({
    queryKey: keys.unreadMentions,
    queryFn: () => mobileApi.unreadMentions(),
    refetchInterval: 60_000,
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
  qc.invalidateQueries({ queryKey: keys.unreadMentions })
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

export function useHabits() {
  return useQuery({ queryKey: keys.habits, queryFn: () => habitApi.getHabits() as Promise<HabitsResponse> })
}
export function useCreateHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { title: string; icon: string; cadence: string; weekdays: number[] }) =>
      habitApi.createHabit(v.title, v.icon, v.cadence, v.weekdays),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.habits }),
  })
}
export function useUpdateHabit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { habit: string; patch: { title?: string; icon?: string; cadence?: string; weekdays?: number[] } }) =>
      habitApi.updateHabit(v.habit, v.patch),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.habits }),
  })
}
export function useDeleteHabit() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (habit: string) => habitApi.deleteHabit(habit), onSettled: () => qc.invalidateQueries({ queryKey: keys.habits }) })
}
export function useToggleHabit() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (v: { habit: string; date?: string }) => habitApi.toggleHabit(v.habit, v.date), onSettled: () => qc.invalidateQueries({ queryKey: keys.habits }) })
}
export function useAdoptSuggestion() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (key: string) => habitApi.adoptSuggestion(key), onSettled: () => qc.invalidateQueries({ queryKey: keys.habits }) })
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

export function useTeamLeave() {
  return useQuery({
    queryKey: ['team-leave'],
    queryFn: async () => (await mobileApi.teamLeave()).rows,
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
    queryFn: async () => {
      const rows = await resource.list<Booking[]>('Resource Booking', {
        fields: ['name', 'title', 'booked_by', 'start', 'end', 'room', 'status'],
        limit: 0,
      })
      // Sort: booked date DESC, then time-of-day ASC (start = "YYYY-MM-DDTHH:MM:SS")
      return rows.sort(
        (a, b) =>
          b.start.slice(0, 10).localeCompare(a.start.slice(0, 10)) ||
          a.start.slice(11).localeCompare(b.start.slice(11)),
      )
    },
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

export const ADS_PAGE_SIZE = 30
export const useAds = (adType?: string, q?: string, mine?: boolean) => {
  const query = useInfiniteQuery({
    queryKey: keys.ads(adType, q, mine),
    queryFn: ({ pageParam }) => papanApi.list(adType, q, mine, pageParam, ADS_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.has_more ? pages.length * ADS_PAGE_SIZE : undefined),
  })
  return { ...query, items: query.data?.pages.flatMap((p) => p.items) ?? [] }
}

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

// project set ⇒ notes scoped to that project (member overlay); omit ⇒ all
// notes about the user (profile aggregate).
export const useUserNotes = (user: string, project?: string) =>
  useQuery({
    queryKey: keys.userNotes(user, project),
    queryFn: () => mobileApi.listUserNotes(user, project),
    enabled: !!user,
  })

export function useAddUserNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { user: string; body: string; note_date?: string | null; shared_with_user?: 0 | 1; project?: string }) =>
      mobileApi.addUserNote(args),
    // Invalidate every project-scoped variant for this user (prefix match).
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['user-notes', v.user] }),
  })
}

export function useDeleteUserNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { name: string; user: string }) => mobileApi.deleteUserNote(args.name),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['user-notes', v.user] }),
  })
}

// ---- Superpowers (self-claimed + peer-voted traits, admin settings) ----

export const useSuperpowers = () =>
  useQuery({ queryKey: keys.superpowers, queryFn: () => mobileApi.listSuperpowers() })

export const useVotableUsers = () =>
  useQuery({ queryKey: keys.votableUsers, queryFn: () => mobileApi.listVotableUsers() })

// Daily recognition gate: is the session user forced to recognize a colleague now?
export const useRecognitionGate = () =>
  useQuery({ queryKey: keys.recognitionGate, queryFn: () => mobileApi.getRecognitionGate() })

// DISC + personality reminder: does the session user still owe a sub-test? No poll — like the gate.
export const useDiscReminder = () =>
  useQuery({ queryKey: keys.discReminder, queryFn: () => mobileApi.getDiscReminder() })

// Forced real-photo upload: does the session user still owe a profile photo? No poll — like the gate.
export const usePhotoGate = () =>
  useQuery({ queryKey: keys.photoGate, queryFn: () => mobileApi.getPhotoGate() })

// Caller's own stored DISC/personality results for the read-only self-view.
export const useMyDisc = () =>
  useQuery({ queryKey: keys.myDisc, queryFn: () => mobileApi.getMyDisc() })

// System-Manager-only preview of the gate (ignores the flag / membership / once-per-day),
// for the testing screen. Separate query key so it never clashes with the real gate.
export const useRecognitionGatePreview = () =>
  useQuery({ queryKey: ['recognition-gate-preview'], queryFn: () => mobileApi.getRecognitionGate(1) })

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
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: keys.userSuperpowers(v.user) })
      // Refresh boot so has_superpower flips and the onboarding gate closes.
      qc.invalidateQueries({ queryKey: keys.boot })
    },
  })
}

export function useCastVote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ratee, superpower, score }: { ratee: string; superpower: string; score: number }) =>
      mobileApi.castVote(ratee, superpower, score),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: keys.userSuperpowers(v.ratee) })
      // Casting a vote may satisfy today's recognition gate — refresh it so it clears.
      qc.invalidateQueries({ queryKey: keys.recognitionGate })
    },
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

// Cast several superpower votes for one ratee in one go (used by the recognition gate,
// which lets you score multiple traits per line). Invalidates the gate ONCE at the end
// so the gate doesn't unmount mid-batch.
export function useCastVotes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ratee, votes }: { ratee: string; votes: { superpower: string; score: number }[] }) => {
      for (const v of votes) await mobileApi.castVote(ratee, v.superpower, v.score)
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: keys.userSuperpowers(v.ratee) })
      qc.invalidateQueries({ queryKey: keys.recognitionGate })
    },
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

// --- Food Invite (Makan Bareng) ---------------------------------------------

/** Open invites the session user hasn't answered. Poll backstop for the popup;
 * FoodInviteWatcher also refetches this on the `food_invite` realtime event.
 * Poll-safe for everyone (no invites → []). */
export function usePendingFoodInvites() {
  return useQuery({
    queryKey: keys.foodInvitesPending,
    queryFn: () => mobileApi.pendingFoodInvites(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })
}

/** One invite by name — the shared /food/:name link page and the inviter's
 * roster. Polls so the inviter's Ikut/Nggak/Belum-jawab tally stays live. */
export function useFoodInvite(name: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.foodInvite(name ?? ''),
    queryFn: () => mobileApi.getFoodInvite(name!),
    enabled: enabled && !!name,
    refetchInterval: 20_000,
  })
}

export function useRespondFoodInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ invite, response }: { invite: string; response: 'Yes' | 'No' }) =>
      mobileApi.respondFoodInvite(invite, response),
    onSettled: (_r, _e, v) => {
      qc.invalidateQueries({ queryKey: keys.foodInvitesPending })
      qc.invalidateQueries({ queryKey: keys.foodInvite(v.invite) })
    },
  })
}

export function useCreateFoodInvite() {
  return useMutation({
    mutationFn: async (v: {
      message: string
      order_by: string
      audience_type: import('@/lib/types').FoodAudience
      place?: string
      users?: string[]
      projects?: string[]
    }) => {
      const res = await mobileApi.createFoodInvite(v)
      if (res.status !== 'success') throw new Error(res.message || 'Gagal membuat undangan')
      return res
    },
  })
}

/** Internal-team + intern directory for the "specific people" picker. */
export function useFoodInvitableUsers(txt = '') {
  return useQuery({
    queryKey: ['food-invitable', txt] as const,
    queryFn: () => mobileApi.foodInvitableUsers(txt),
  })
}

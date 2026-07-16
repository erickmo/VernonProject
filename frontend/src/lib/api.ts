// Thin client over Frappe's whitelisted-method endpoints.
// Reads -> GET; mutations -> POST with CSRF header.

import type { EventItem, EventRegistration, PayConfig, RegisterResult, ManagedEvent, RosterEntry, EventFormPayload, Conflict, AdListItem, AdDetail, AdPayload, AdBan, LmsCourseCard, LmsCourseDetail, LmsMyEnrollment, LmsManagedCourse, LmsReportRow, LmsCompleteResult, LmsAssignableUser, TodoFile, AppRelease } from './types'

const METHOD = '/api/method/'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function csrf(): string {
  // Injected into m.html by Frappe. Empty string for Guest is fine for GET.
  // @ts-expect-error injected global
  return (window.csrf_token as string) || ''
}

async function request<T>(
  dotted: string,
  params: Record<string, unknown> = {},
  method: 'GET' | 'POST' = 'GET',
): Promise<T> {
  let url = METHOD + dotted
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: string | undefined

  if (method === 'GET') {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v))
    }
    const s = qs.toString()
    if (s) url += '?' + s
  } else {
    headers['Content-Type'] = 'application/json'
    headers['X-Frappe-CSRF-Token'] = csrf()
    body = JSON.stringify(params)
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
    credentials: 'same-origin',
  })

  if (res.status === 401 || res.status === 403) {
    throw new ApiError('Not authenticated', res.status)
  }

  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const msg =
      (data && (data._server_messages || data.exception || data.message)) ||
      `Request failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Request failed', res.status)
  }

  return (data?.message ?? data) as T
}

export const api = {
  get: <T>(dotted: string, params?: Record<string, unknown>) =>
    request<T>(dotted, params, 'GET'),
  post: <T>(dotted: string, params?: Record<string, unknown>) =>
    request<T>(dotted, params, 'POST'),
}

const M = 'vernon_project.api.mobile.'
const A = 'vernon_project.api.attendance.'
const BK = 'vernon_project.api.booking.'
const IN = 'vernon_project.api.income.'
const R = 'vernon_project.api.report.'

/** Live pre-submit conflict check. Reuses the deployed whitelisted method.
 *  equipment is JSON-encoded (list param). Returns the conflicts array. */
export function checkAvailability(args: {
  start: string
  end: string
  room?: string
  equipment?: string[]
  exclude?: string
}): Promise<{ conflicts: Conflict[] }> {
  return api.post<{ conflicts: Conflict[] }>(BK + 'check_availability', {
    start: args.start,
    end: args.end,
    room: args.room,
    equipment: JSON.stringify(args.equipment ?? []),
    exclude: args.exclude,
  })
}

export const mobileApi = {
  bootstrap: () => api.get('vernon_project.api.mobile.bootstrap'),
  dashboard: () => api.get(M + 'get_dashboard'),
  dailyVerse: () => api.get<import('./types').DailyVerse>('vernon_project.api.verse.get_daily_verse'),
  calendar: () => api.get(M + 'get_calendar'),
  projects: () => api.get(M + 'get_projects'),
  project: (name: string) => api.get(M + 'get_project', { project: name }),
  projectGantt: (project: string) => api.get(M + 'get_project_gantt', { project }),
  projectDetail: (projectDetail: string, includeCancelled = false) =>
    api.get(M + 'get_project_detail', {
      project_detail: projectDetail,
      ...(includeCancelled ? { include_cancelled: 1 } : {}),
    }),
  memberWorkload: (project: string, user: string, includeCompleted: boolean) =>
    api.get(M + 'get_member_workload', {
      project,
      user,
      include_completed: includeCompleted ? 1 : 0,
    }),
  projectItem: (name: string) => api.get(M + 'get_project_item', { project_item: name }),
  advanceStatus: (todoId: string) =>
    api.post<{
      status: string
      message: string
      status_key?: string
      can_advance?: boolean
      next_status_label?: string | null
    }>('vernon_project.api.project_todo.update_status', { todo_id: todoId }),
  bulkAdvance: (todoIds: string[]) =>
    api.post<{ status: string; approved: number; failed: number }>(
      'vernon_project.api.project_todo.bulk_update_status',
      { todo_ids: JSON.stringify(todoIds) },
    ),
  bulkReject: (todoIds: string[], reason: string) =>
    api.post<{ status: string; rejected: number; failed: number }>(
      'vernon_project.api.project_todo.bulk_reject_status',
      { todo_ids: JSON.stringify(todoIds), reason },
    ),
  rejectStatus: (todoId: string, reason: string) =>
    api.post<{ status: string; message: string; status_key?: string }>(
      'vernon_project.api.project_todo.reject_status',
      { todo_id: todoId, reason },
    ),
  setAutoApprove: (todoId: string, mode: 'on' | 'off' | 'inherit') =>
    api.post<{ status: string; message?: string; mode?: 'on' | 'off' | 'inherit' }>(
      'vernon_project.api.project_todo.set_auto_approve',
      { todo_id: todoId, mode },
    ),
  setProjectAutoApprove: (project: string, enabled: 0 | 1) =>
    api.post<{ status: string; message?: string; auto_approve?: 0 | 1 }>(
      'vernon_project.api.project_todo.set_project_auto_approve',
      { project, enabled },
    ),
  cancelTodo: (projectItem: string, reason?: string) =>
    api.post<{ status: string; message: string }>(M + 'cancel_todo', {
      project_item: projectItem,
      ...(reason ? { reason } : {}),
    }),
  restoreTodo: (projectItem: string) =>
    api.post<{ status: string; message: string }>(M + 'restore_todo', {
      project_item: projectItem,
    }),
  deleteTodo: (projectItem: string) =>
    api.post<{ status: string; message?: string }>(M + 'delete_todo', {
      project_item: projectItem,
    }),
  saveNotes: (todoId: string, notes: string) =>
    api.post<{ status: string; message: string }>(
      'vernon_project.api.project_todo.save_notes',
      { todo_id: todoId, notes },
    ),
  listTodoFiles: (todoId: string) =>
    api.get<TodoFile[]>('vernon_project.api.project_todo.list_todo_files', { todo_id: todoId }),
  deleteTodoFile: (todoId: string, fileName: string) =>
    api.post<{ status: string }>('vernon_project.api.project_todo.delete_todo_file', {
      todo_id: todoId,
      file_name: fileName,
    }),
  updateTodo: (todoId: string, fields: Record<string, unknown>) =>
    api.post<{ status: string; message: string }>(M + 'update_todo', {
      project_item: todoId,
      ...fields,
    }),
  postpone: (targetType: 'Project' | 'Project Detail', targetName: string, newDate: string) =>
    api.post<{ shifted_count: number; skipped_count: number; delta_days: number }>(
      'vernon_project.api.postpone.postpone',
      { target_type: targetType, target_name: targetName, new_date: newDate },
    ),
  setTodoAllocations: (todoId: string, allocations: { date: string; minutes: number; note?: string }[]) =>
    api.post<{ status: string; message: string; allocations: { date: string; minutes: number; note?: string }[] }>(
      M + 'set_todo_allocations',
      { project_item: todoId, allocations: JSON.stringify(allocations) },
    ),
  setAssignedAllocation: (todoId: string, allocations: { date: string; minutes: number; note?: string }[]) =>
    api.post<{ status: string; message: string; allocations: { date: string; minutes: number; note?: string }[] }>(
      M + 'set_assigned_allocation',
      { project_item: todoId, allocations: JSON.stringify(allocations) },
    ),
  createTask: (fields: Record<string, unknown>) =>
    api.post('frappe.client.insert', {
      doc: JSON.stringify({
        doctype: 'Project Todo',
        status: '⚪️ Planned',
        ...fields,
      }),
    }),
  reportOptions: () => api.get(M + 'get_report_options'),
  formOptions: () => api.get(M + 'get_form_options'),
  listUsers: () => api.get<{ users: import('./types').ManagedUser[] }>(M + 'list_users'),
  createUser: (payload: {
    email: string
    full_name: string
    roles: string[]
    send_welcome: boolean
    member_type?: string
  }) =>
    api.post<{ name: string }>(M + 'create_user', {
      email: payload.email,
      full_name: payload.full_name,
      roles: JSON.stringify(payload.roles),
      send_welcome: payload.send_welcome ? 1 : 0,
      member_type: payload.member_type,
    }),
  updateUser: (user: string, payload: import('./types').UserFormPayload) =>
    api.post<{ name: string }>(M + 'update_user', {
      user,
      full_name: payload.full_name,
      roles: JSON.stringify(payload.roles),
      enabled: payload.enabled,
      member_type: payload.member_type,
    }),
  resetUserPassword: (user: string) =>
    api.post<{ ok: boolean }>(M + 'reset_user_password', { user }),
  deleteUser: (user: string) =>
    api.post<{ deleted: string }>(M + 'delete_user', { user }),
  impersonate: (user: string) =>
    api.post<{ ok: boolean; user: string }>(M + 'impersonate', { user }),
  setUserPassword: (user: string, newPassword: string) =>
    api.post<{ ok: boolean }>(M + 'set_user_password', { user, new_password: newPassword }),
  changeMyPassword: (oldPassword: string, newPassword: string) =>
    api.post<{ ok: boolean }>(M + 'change_my_password', {
      old_password: oldPassword,
      new_password: newPassword,
    }),
  getComments: (refDoctype: string, refName: string) =>
    api.get(M + 'get_comments', {
      reference_doctype: refDoctype,
      reference_name: refName,
    }),
  addComment: (refDoctype: string, refName: string, content: string) =>
    api.post(M + 'add_comment', {
      reference_doctype: refDoctype,
      reference_name: refName,
      content,
    }),
  getMentionableUsers: (refDoctype: string, refName: string) =>
    api.get<import('./types').MentionUser[]>(M + 'get_mentionable_users', {
      reference_doctype: refDoctype,
      reference_name: refName,
    }),
  runReport: (report: string, filters: Record<string, unknown>) =>
    api.post(M + 'run_report', { report, filters: JSON.stringify(filters) }),
  getWallet: () => api.get(M + 'get_wallet'),
  getWalletLog: () => api.get(M + 'get_wallet_log'),
  getWeeklyRecap: (weekOffset = 0) => api.get(M + 'get_weekly_recap', { week_offset: weekOffset }),
  sayThanks: (toUser: string) =>
    api.post<{ status: string; message?: string }>(M + 'say_thanks', { to_user: toUser }),
  getLeaderboard: (period: string, brand?: string | null, dimension = 'productivity') =>
    api.get(M + 'get_leaderboard', { period, dimension, ...(brand ? { brand } : {}) }),
  getMarketplace: () => api.get(M + 'get_marketplace'),
  redeemReward: (reward: string) =>
    api.post<{ balance: number; redemption: string }>(M + 'redeem_reward', { reward }),
  listRedemptions: (status: string) => api.get(M + 'list_redemptions', { status }),
  grantPoints: (user: string, amount: number, note?: string) =>
    api.post<{ balance: number; granted: number }>(M + 'grant_points', {
      user,
      amount,
      ...(note ? { note } : {}),
    }),
  listGrantUsers: () => api.get<{ users: import('./types').GrantUser[] }>(M + 'list_grant_users'),
  listTransferUsers: () =>
    api.get<{ users: import('./types').TransferUser[] }>(M + 'list_transfer_users'),
  transferTasks: (fromUser: string, toUser: string, project?: string, dryRun?: boolean) =>
    api.post<{ count?: number; blocked_projects?: string[]; moved?: number }>(
      M + 'transfer_tasks',
      {
        from_user: fromUser,
        to_user: toUser,
        ...(project ? { project } : {}),
        ...(dryRun ? { dry_run: 1 } : {}),
      },
    ),
  getTeamWall: () => api.get<import('./types').TeamWallResponse>(M + 'get_team_wall'),
  income: () => api.get<import('./types').IncomeData>(IN + 'get_income'),
  submitIncomeClaim: (opportunity: string, details: string) =>
    api.post<{ ok: boolean; name: string }>(IN + 'submit_claim', { opportunity, details }),
  incomeManage: () => api.get<import('./types').IncomeManageData>(IN + 'manage_data'),
  saveOpportunity: (v: {
    name?: string
    title: string
    description?: string
    reward: string
    period_start: string
    period_end?: string
    status: string
  }) => api.post<{ ok: boolean; name: string }>(IN + 'save_opportunity', v),
  reviewIncomeClaim: (name: string, status: string, review_note?: string) =>
    api.post<{ ok: boolean }>(IN + 'review_claim', {
      name,
      status,
      ...(review_note ? { review_note } : {}),
    }),
  giftPoints: (toUser: string, amount: number, note?: string) =>
    api.post<{ balance: number; gifted: number; to: string }>(M + 'gift_points', {
      to_user: toUser,
      amount,
      ...(note ? { note } : {}),
    }),
  listGiftRecipients: () =>
    api.get<{ users: import('./types').GiftUser[] }>(M + 'list_gift_recipients'),
  getAppSettings: () => api.get<import('./types').AppSettings>(M + 'get_app_settings'),
  saveAppSettings: (settings: Partial<import('./types').AppSettings>) =>
    api.post<import('./types').AppSettings>(
      M + 'save_app_settings',
      settings as Record<string, unknown>,
    ),
  getHomeBanners: () => api.get<import('./types').BannerSlide[]>(M + 'get_home_banners'),
  previousShiftShortfall: () =>
    api.get<import('./types').PreviousShiftShortfall>(R + 'my_previous_shift_shortfall'),
  assignmentOverloadCheck: (user: string, date: string, added_minutes: number) =>
    api.get<import('./types').AssignmentOverload>(R + 'assignment_overload_check', { user, date, added_minutes }),
  getNotifications: (limit = 30) =>
    api.get<import('./types').NotificationsResponse>(M + 'get_notifications', { limit }),
  getAppReleases: (platform?: string) =>
    api.get<AppRelease[]>('vernon_project.api.app_release.get_app_releases', platform ? { platform } : {}),
  markNotificationRead: (name: string) =>
    api.post<{ ok: boolean }>(M + 'mark_notification_read', { name }),
  markAllRead: () => api.post<{ ok: boolean; marked: number }>(M + 'mark_all_read'),
  registerPushSubscription: (subscription: unknown) =>
    api.post<{ ok: boolean }>(M + 'register_push_subscription', {
      subscription: JSON.stringify(subscription),
    }),
  unregisterPushSubscription: (endpoint: string) =>
    api.post<{ ok: boolean }>(M + 'unregister_push_subscription', { endpoint }),
  dataHealth: () => api.get(M + 'data_health'),
  getPersonalNotes: () =>
    api.get<{
      owned: import('./types').PersonalNote[]
      shared: import('./types').PersonalNote[]
    }>(M + 'get_personal_notes'),
  getPersonalNote: (noteId: string) =>
    api.get<{ status: string; message?: string; note?: import('./types').PersonalNote }>(
      M + 'get_personal_note',
      { note_id: noteId },
    ),
  createPersonalNote: (
    title: string,
    body: string,
    items: import('./types').PersonalNoteItem[],
  ) =>
    api.post<{ status: string; message?: string; name?: string }>(M + 'create_personal_note', {
      title,
      body,
      items: JSON.stringify(items),
    }),
  updatePersonalNote: (
    noteId: string,
    title: string,
    body: string,
    items: import('./types').PersonalNoteItem[],
  ) =>
    api.post<{ status: string; message?: string }>(M + 'update_personal_note', {
      note_id: noteId,
      title,
      body,
      items: JSON.stringify(items),
    }),
  deletePersonalNote: (noteId: string) =>
    api.post<{ status: string; message?: string }>(M + 'delete_personal_note', { note_id: noteId }),
  sharePersonalNote: (noteId: string, users: string[]) =>
    api.post<{ status: string; message?: string; shares?: import('./types').PersonalNoteShare[] }>(
      M + 'share_personal_note',
      { note_id: noteId, users: JSON.stringify(users) },
    ),
  unsharePersonalNote: (noteId: string, user: string) =>
    api.post<{ status: string; message?: string }>(M + 'unshare_personal_note', {
      note_id: noteId,
      user,
    }),
  createMeeting: (fields: Record<string, unknown>) =>
    api.post<{ status: string; message: string; name?: string }>(M + 'create_meeting', fields),
  updateMeeting: (fields: Record<string, unknown>) =>
    api.post<{ status: string; message: string }>(M + 'update_meeting', fields),
  listMeetings: (project?: string) =>
    api.get<{ meetings: import('./types').MeetingListItem[] }>(M + 'list_meetings', {
      ...(project ? { project } : {}),
    }),
  setMeetingParticipants: (meeting: string, users: string[]) =>
    api.post<{ status: string; message: string }>(M + 'set_meeting_participants', {
      meeting,
      users: JSON.stringify(users),
    }),
  markMeetingDone: (meeting: string, awardees?: string[]) =>
    api.post<{ status: string; message: string }>(M + 'mark_meeting_done', {
      meeting,
      ...(awardees ? { awardees: JSON.stringify(awardees) } : {}),
    }),
  reopenMeeting: (meeting: string) =>
    api.post<{ status: string; message: string }>(M + 'reopen_meeting', { meeting }),
  deleteMeeting: (meeting: string) =>
    api.post<{ status: string; message: string }>(M + 'delete_meeting', { meeting }),
  meetingInvitableUsers: (project: string, txt = '') =>
    api.get<{ users: import('./types').MeetingInvitableUser[] }>(M + 'meeting_invitable_users', {
      project,
      txt,
    }),
  getTeamActivity: (days = 14, limit = 50) =>
    api.get<{ items: import('./types').ActivityItem[] }>(M + 'get_team_activity', { days, limit }),
  toggleReaction: (todo: string, reaction: import('./types').ReactionKey) =>
    api.post<import('./types').ToggleReactionResult>(M + 'toggle_reaction', { todo, reaction }),
  getAvatarCatalog: () =>
    api.get<import('./types').AvatarCatalog>(M + 'get_avatar_catalog'),
  buyAvatarOption: (style: string, slot: string, value: string) =>
    api.post<{ balance: number }>(M + 'buy_avatar_option', { style, slot, value }),
  buyAvatarAsset: (asset_name: string) =>
    api.post<{ balance: number; completed?: import('./types').SetCompletion | null }>(M + 'buy_avatar_asset', { asset_name }),
  getCrateStatus: () =>
    api.get<import('./types').CrateStatus>(M + 'get_crate_status'),
  openTaskCrate: () =>
    api.post<import('./types').CrateOpenResult>(M + 'open_task_crate', {}),
  getMyAvatar: () =>
    api.get<import('./types').AvatarConfig>(M + 'get_my_avatar'),
  saveMyAvatar: (config: import('./types').AvatarConfig, snapshot_dataurl?: string) =>
    api.post<import('./types').AvatarConfig>(M + 'save_my_avatar', {
      config_json: JSON.stringify(config),
      snapshot_dataurl,
    }),
  getGamification: () =>
    api.get<import('./types').Gamification>(M + 'get_gamification'),
  getGamificationSettings: () =>
    api.get<{
      premium_price: number
      points_per_level: number
      daily_reward_points: number
      streak_bonus_points: number
      streak_cap: number
      level_rewards: { level: number; reward_points: number; reward_asset: string }[]
      achievements: { code: string; title: string; icon: string; condition: string; threshold: number; reward_points: number; reward_asset: string; is_tier: number; color: string }[]
      assets: { asset_name: string; asset_type: string; price: number; is_default: number }[]
    }>(M + 'get_gamification_settings'),
  saveGamificationSettings: (p: {
    premium_price: number
    points_per_level: number
    daily_reward_points: number
    streak_bonus_points: number
    streak_cap: number
    level_rewards: unknown[]
    achievements: unknown[]
    assets?: { asset_name: string; asset_type: string; price: number; is_default: number }[]
  }) =>
    api.post<{ ok: boolean }>(M + 'save_gamification_settings', {
      ...p,
      level_rewards: JSON.stringify(p.level_rewards),
      achievements: JSON.stringify(p.achievements),
      ...(p.assets !== undefined ? { assets: JSON.stringify(p.assets) } : {}),
    }),
  claimDaily: () =>
    api.post<{ streak: number; granted: number; balance: number; last_claim: string; already?: boolean }>(
      M + 'claim_daily',
    ),
  submitFeedback: (feedback_type: string, message: string, is_anonymous: boolean) =>
    api.post<{ status: string }>('vernon_project.api.feedback.submit_feedback', {
      feedback_type,
      message,
      is_anonymous: is_anonymous ? 1 : 0,
    }),
  listFeedback: (status?: string) =>
    api.get<{ items: import('./types').FeedbackItem[] }>(
      'vernon_project.api.feedback.list_feedback',
      status ? { status } : {},
    ),
  setFeedbackStatus: (name: string, status: string) =>
    api.post<{ status: string }>('vernon_project.api.feedback.set_feedback_status', {
      name,
      status,
    }),
  linkTask: (feedback: string, todo: string) =>
    api.post<{ status: string }>('vernon_project.api.feedback.link_task', {
      feedback,
      todo,
    }),
  stationToken: (station: string, key: string) =>
    api.get<{ station: string; counter: number; token: string }>(A + 'station_token', { station, key }),
  attendanceScan: (station: string, counter: number, token: string) =>
    api.post<{
      status: string
      message?: string
      daily?: {
        status: string
        late_minutes: number
        early_minutes: number
        penalty_points: number
        first_scan: string | null
        last_scan: string | null
      } | null
    }>(A + 'attendance_scan', { station, counter, token }),
  myAttendance: (limit = 30) =>
    api.get<{
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
    }>(A + 'my_attendance', { limit }),
  requestException: (from_date: string, to_date: string, exception_type: 'WFH' | 'Leave', reason?: string, leave_type?: string, proof?: string) =>
    api.post<{ status: string; message?: string; name?: string }>(A + 'request_exception', {
      from_date,
      to_date,
      exception_type,
      reason,
      leave_type,
      proof,
    }),
  listLeaveTypes: () =>
    api.get<{ status: string; types: import('./types').LeaveType[] }>(A + 'list_leave_types'),
  adminListLeaveTypes: () =>
    api.get<{ status: string; types: import('./types').LeaveType[] }>(A + 'admin_list_leave_types'),
  saveLeaveType: (payload: Partial<import('./types').LeaveType> & { name?: string }) =>
    api.post<{ status: string; name?: string; message?: string }>(A + 'save_leave_type', payload),
  deleteLeaveType: (name: string) =>
    api.post<{ status: string; message?: string }>(A + 'delete_leave_type', { name }),
  approveException: (exception_id: string, as_hr = false) =>
    api.post<{ status: string; message?: string; approval_status?: string }>(A + 'approve_exception', {
      exception_id,
      as_hr: as_hr ? 1 : 0,
    }),
  rejectException: (exception_id: string, reason: string, as_hr = false) =>
    api.post<{ status: string; message?: string; approval_status?: string }>(A + 'reject_exception', {
      exception_id,
      reason,
      as_hr: as_hr ? 1 : 0,
    }),
  pendingExceptionApprovals: () =>
    api.get<{ status: string; rows: import('./types').AttendanceExceptionRow[] }>(A + 'pending_exception_approvals'),
  hrPendingExceptions: () =>
    api.get<{ status: string; rows: import('./types').AttendanceExceptionRow[] }>(A + 'hr_pending_exceptions'),
  myLeaders: () => api.get<{ status: string; leaders: string[] }>(A + 'my_leaders'),
  myExceptions: (limit = 30) =>
    api.get<{ status: string; rows: import('./types').AttendanceExceptionRow[] }>(A + 'my_exceptions', { limit }),
  attendanceReport: (filters: {
    from_date: string
    to_date: string
    employee?: string
    brand?: string
    status?: string
  }) =>
    api.get<{
      columns: { label: string; fieldname: string; fieldtype: string }[]
      rows: Record<string, unknown>[]
      stats: { present: number; late: number; absent: number; excused: number; penalty: number }
    }>(A + 'attendance_report', filters),
  underOccupied: (from_date: string, to_date: string) =>
    api.get<{
      threshold: number; tolerance: number; effective: number
      from_date: string; to_date: string; day_count: number
      rows: { user: string; full_name: string; assigned_total: number; avg_daily: number; under_days: number; deficit: number }[]
    }>('vernon_project.api.report.under_occupied', { from_date, to_date }),
  todosDue: (due_by: string) =>
    api.get<{
      due_by: string
      rows: {
        todo: string; to_do: string; project: string; project_name: string
        my_role: string; deadline: string | null; status: string
        assigned_to: string; assignee_name: string; assignee_email: string
        assignee_mobile: string | null; overdue: boolean
      }[]
    }>('vernon_project.api.report.todos_due', { due_by }),
  buzzTodo: (todo: string) =>
    api.post<{ ok: boolean; assignee: string }>('vernon_project.api.report.buzz_todo', { todo }),
  updateMyProfile: (payload: Partial<import('./types').EmployeeSoft>) =>
    api.post<{ status: string; message?: string }>(M + 'update_my_profile', {
      ...payload,
      education: JSON.stringify(payload.education ?? []),
      skills: JSON.stringify(payload.skills ?? []),
      trainings: JSON.stringify(payload.trainings ?? []),
    } as Record<string, unknown>),
  getEmployeeProfile: (user: string) =>
    api.get<import('./types').EmployeeProfileAdmin>(M + 'get_employee_profile', { user }),
  updateEmployeeProfile: (user: string, payload: Record<string, unknown>) =>
    api.post<{ status: string; message?: string }>(M + 'update_employee_profile', { user, ...payload }),
  // Atomic User + Employee Profile save (edit mode) — one request/transaction, no partial save.
  saveUserWithProfile: (user: string, payload: Record<string, unknown>) =>
    api.post<{ name: string }>('vernon_project.api.employee_admin.save_user_with_profile', {
      user,
      ...payload,
      roles: JSON.stringify((payload.roles as string[]) ?? []),
    }),
  logbook: (from_date: string, to_date: string, user?: string) =>
    api.get<import('./types').LogbookResponse>('vernon_project.api.report.logbook', { from_date, to_date, ...(user ? { user } : {}) }),
  websiteBranding: () =>
    api.get<{ app_name?: string; app_logo?: string }>('frappe.client.get_value', { doctype: 'Website Settings', fieldname: JSON.stringify(['app_name', 'app_logo']) }),
}

const EV = 'vernon_project.api.events.'
const MT = 'vernon_project.api.midtrans.'

export const eventsApi = {
  list: () => api.get<EventItem[]>(EV + 'list_events'),
  get: (event: string) => api.get<EventItem>(EV + 'get_event', { event }),
  register: (event: string) => api.post<RegisterResult>(EV + 'register', { event }),
  mine: () => api.get<EventRegistration[]>(EV + 'my_registrations'),
  payConfig: () => api.get<PayConfig>(MT + 'pay_config'),
}

const EA = 'vernon_project.api.events_admin.'

export const eventsAdminApi = {
  list: () => api.get<ManagedEvent[]>(EA + 'manage_list_events'),
  get: (name: string) => api.get<Record<string, unknown>>(EA + 'get_managed_event', { name }),
  save: (payload: EventFormPayload, name?: string) =>
    api.post<{ name: string }>(EA + 'save_event', {
      payload: JSON.stringify(payload),
      ...(name ? { name } : {}),
    }),
  remove: (name: string) => api.post<{ ok: boolean }>(EA + 'delete_event', { name }),
  roster: (event: string) => api.get<RosterEntry[]>(EA + 'event_roster', { event }),
  cancelReg: (name: string) => api.post<{ ok: boolean }>(EA + 'cancel_registration', { name }),
  markAttended: (name: string, attended: number) =>
    api.post<{ ok: boolean }>(EA + 'mark_attended', { name, attended }),
}

// Multipart upload to a whitelisted method. Returns the saved file URL.
export async function uploadRewardImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(METHOD + 'vernon_project.api.mobile.upload_reward_image', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Frappe-CSRF-Token': csrf() },
    body: fd,
    credentials: 'same-origin',
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg =
      (data && (data._server_messages || data.exception || data.message)) || `Upload failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Upload failed', res.status)
  }
  const out = data?.message ?? data
  return out.file_url as string
}

// Multipart upload of a home-banner image. Gated server-side on settings admins.
export async function uploadBannerImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(METHOD + 'vernon_project.api.mobile.upload_banner_image', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Frappe-CSRF-Token': csrf() },
    body: fd,
    credentials: 'same-origin',
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg =
      (data && (data._server_messages || data.exception || data.message)) || `Upload failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Upload failed', res.status)
  }
  const out = data?.message ?? data
  return out.file_url as string
}

// Multipart upload of a comment image to a whitelisted method. Access is gated
// server-side by comment visibility on the referenced record. Returns the saved
// public file URL (served from /files/...).
export async function uploadCommentImage(
  file: File,
  refDoctype?: string,
  refName?: string,
): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  if (refDoctype) fd.append('reference_doctype', refDoctype)
  if (refName) fd.append('reference_name', refName)
  const res = await fetch(METHOD + 'vernon_project.api.mobile.upload_comment_image', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Frappe-CSRF-Token': csrf() },
    body: fd,
    credentials: 'same-origin',
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg =
      (data && (data._server_messages || data.exception || data.message)) || `Upload failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Upload failed', res.status)
  }
  const out = data?.message ?? data
  return out.file_url as string
}

// Multipart upload of a file attached to a Project Todo. Edit-gated server-side
// (assignee/owner/leader/System Manager). Stored private; returns the saved row.
export async function uploadTodoFile(todoId: string, file: File): Promise<TodoFile> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('todo_id', todoId)
  const res = await fetch(METHOD + 'vernon_project.api.project_todo.upload_todo_file', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Frappe-CSRF-Token': csrf() },
    body: fd,
    credentials: 'same-origin',
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg =
      (data && (data._server_messages || data.exception || data.message)) || `Upload failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Upload failed', res.status)
  }
  const out = data?.message ?? data
  return out as TodoFile
}

const PI = 'vernon_project.api.papan_iklan.'

export const papanApi = {
  list: (ad_type?: string, q?: string, mine?: boolean) =>
    api.get<AdListItem[]>(PI + 'list_ads', {
      ...(ad_type ? { ad_type } : {}),
      ...(q ? { q } : {}),
      ...(mine ? { mine: 1 } : {}),
    }),
  get: (name: string) => api.get<AdDetail>(PI + 'get_ad', { name }),
  create: (payload: AdPayload) =>
    api.post<{ name: string }>(PI + 'create_ad', { payload: JSON.stringify(payload) }),
  update: (name: string, payload: AdPayload) =>
    api.post<{ name: string }>(PI + 'update_ad', { name, payload: JSON.stringify(payload) }),
  setStatus: (name: string, status: string) =>
    api.post<{ status: string }>(PI + 'set_status', { name, status }),
  remove: (name: string) => api.post<{ ok: boolean }>(PI + 'delete_ad', { name }),
  adminRemove: (name: string, reason: string) =>
    api.post<{ status: string }>(PI + 'remove_ad', { name, reason }),
  ban: (user: string, banned_until: string, reason: string) =>
    api.post<{ status: string }>(PI + 'ban_user', { user, banned_until, reason }),
  unban: (user: string) => api.post<{ status: string }>(PI + 'unban_user', { user }),
  bans: () => api.get<AdBan[]>(PI + 'list_bans'),
}

// Multipart upload for an ad photo. Returns the saved public URL.
export async function uploadAdImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(METHOD + 'vernon_project.api.papan_iklan.upload_ad_image', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Frappe-CSRF-Token': csrf() },
    body: fd,
    credentials: 'same-origin',
  })
  let data: any = null
  try { data = await res.json() } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg =
      (data && (data._server_messages || data.exception || data.message)) || `Upload failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Upload failed', res.status)
  }
  const out = data?.message ?? data
  return out.file_url as string
}

const LMS = 'vernon_project.api.lms.'

export const lmsApi = {
  catalog: () => api.get<{ courses: LmsCourseCard[] }>(LMS + 'get_catalog'),
  course: (name: string) => api.get<LmsCourseDetail>(LMS + 'get_course', { name }),
  enroll: (course: string) => api.post<{ ok: boolean; name: string }>(LMS + 'enroll', { course }),
  completeLesson: (course: string, lesson: string) =>
    api.post<LmsCompleteResult>(LMS + 'complete_lesson', { course, lesson }),
  myLearning: () => api.get<{ enrollments: LmsMyEnrollment[] }>(LMS + 'my_learning'),
  manageCourses: () => api.get<{ courses: LmsManagedCourse[] }>(LMS + 'manage_courses'),
  saveCourse: (v: Record<string, unknown>) =>
    api.post<{ ok: boolean; name: string }>(LMS + 'save_course', v),
  saveLesson: (v: Record<string, unknown>) =>
    api.post<{ ok: boolean; name: string }>(LMS + 'save_lesson', v),
  deleteLesson: (name: string) => api.post<{ ok: boolean }>(LMS + 'delete_lesson', { name }),
  deleteCourse: (name: string) => api.post<{ ok: boolean }>(LMS + 'delete_course', { name }),
  assignCourse: (course: string, users: string[], due_date?: string) =>
    api.post<{ ok: boolean; created: number }>(LMS + 'assign_course',
      { course, users: JSON.stringify(users), ...(due_date ? { due_date } : {}) }),
  courseReport: (course: string) =>
    api.get<{ course_title: string; rows: LmsReportRow[] }>(LMS + 'course_report', { course }),
  assignableUsers: () => api.get<{ users: LmsAssignableUser[] }>(LMS + 'list_assignable_users'),
}

export const renameDoc = (doctype: string, oldName: string, newName: string, merge: boolean) =>
  api.post<{ message?: string }>('frappe.client.rename_doc', {
    doctype,
    old_name: oldName,
    new_name: newName,
    merge: merge ? 1 : 0,
  })

// --- Auth (in-app, no desk login page) -------------------------------------

const CACHE_KEY = 'vernon-mobile-cache'

// Frappe's login endpoint is allow_guest and sets the session cookie. On
// success we hard-reload into /m so the page re-renders with a fresh
// csrf_token from the new session (needed for subsequent POST mutations).
export async function login(usr: string, pwd: string): Promise<void> {
  const res = await fetch(METHOD + 'login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ usr, pwd }),
    credentials: 'same-origin',
  })
  if (!res.ok) {
    let msg = 'Invalid email or password'
    try {
      const d = await res.json()
      if (d?.message && typeof d.message === 'string') msg = d.message
    } catch {
      /* keep default */
    }
    throw new ApiError(msg, res.status)
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(METHOD + 'logout', {
      method: 'POST',
      headers: { 'X-Frappe-CSRF-Token': csrf(), Accept: 'application/json' },
      credentials: 'same-origin',
    })
  } catch {
    /* even if the request fails, fall through and clear local state */
  }
  // Drop the persisted cache so the next session doesn't see stale data.
  try {
    window.localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}

// --- Passkey / WebAuthn auth ------------------------------------------------
// Enroll endpoints require a session (CSRF via api.post). Login endpoints are
// allow_guest, so they post raw like login() — no CSRF needed for Guest.

const PK = 'vernon_project.api.passkey.'

export interface PasskeyRow {
  name: string
  label: string | null
  creation: string
  last_used: string | null
}

export const passkeyApi = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerBegin: () => api.post<any>(PK + 'register_begin'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerComplete: (credential: unknown, label: string) =>
    api.post<{ ok: boolean; name: string; label: string }>(PK + 'register_complete', {
      credential,
      label,
    }),
  listPasskeys: () => api.get<{ passkeys: PasskeyRow[] }>(PK + 'list_passkeys'),
  revokePasskey: (name: string) => api.post<{ ok: boolean }>(PK + 'revoke_passkey', { name }),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function passkeyLoginBegin(): Promise<any> {
  const res = await fetch(METHOD + PK + 'login_begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
    credentials: 'same-origin',
  })
  if (!res.ok) throw new ApiError('Could not start passkey sign-in', res.status)
  const data = await res.json()
  return data?.message ?? data
}

export async function passkeyLoginComplete(credential: unknown, handle: string): Promise<void> {
  const res = await fetch(METHOD + PK + 'login_complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ credential, handle }),
    credentials: 'same-origin',
  })
  if (!res.ok) {
    let msg = 'Passkey sign-in failed'
    try {
      const d = await res.json()
      if (d?.message && typeof d.message === 'string') msg = d.message
      else if (d?._server_messages) {
        const parsed = JSON.parse(d._server_messages)
        if (Array.isArray(parsed) && parsed.length) msg = JSON.parse(parsed[0]).message || msg
      }
    } catch {
      /* keep default */
    }
    throw new ApiError(msg, res.status)
  }
}

// Diagnostic: fire-and-forget the exact browser passkey error to the server log.
export function reportPasskeyClientError(detail: string): void {
  try {
    fetch(METHOD + PK + 'client_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ detail }),
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}

// --- Native resource API (/api/resource) ----------------------------------
const RESOURCE = '/api/resource/'

async function resourceRequest<T>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    params?: Record<string, unknown>
    body?: unknown
  } = {},
): Promise<T> {
  const { method = 'GET', params, body } = opts
  let url = RESOURCE + path
  const headers: Record<string, string> = { Accept: 'application/json' }
  let payload: string | undefined

  if (method === 'GET') {
    if (params) {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue
        qs.set(k, typeof v === 'string' ? v : JSON.stringify(v))
      }
      const s = qs.toString()
      if (s) url += '?' + s
    }
  } else {
    headers['Content-Type'] = 'application/json'
    headers['X-Frappe-CSRF-Token'] = csrf()
    if (body !== undefined) payload = JSON.stringify(body)
  }

  const res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' })

  // Only 401 means "not logged in" (drives the in-app login). A 403 here is a
  // real permission denial we want to surface with its message.
  if (res.status === 401) throw new ApiError('Not authenticated', 401)

  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const msg =
      (data && (data._server_messages || data.exception || data.message)) ||
      `Request failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Request failed', res.status)
  }

  return (data?.data ?? data?.message ?? data) as T
}

const enc = (s: string) => encodeURIComponent(s)

export const resource = {
  get: <T>(doctype: string, name: string) =>
    resourceRequest<T>(`${enc(doctype)}/${enc(name)}`),
  list: <T>(
    doctype: string,
    opts: { filters?: unknown; fields?: string[]; limit?: number } = {},
  ) =>
    resourceRequest<T>(enc(doctype), {
      params: {
        filters: opts.filters,
        fields: opts.fields,
        limit_page_length: opts.limit ?? 0,
      },
    }),
  create: <T>(doctype: string, doc: Record<string, unknown>) =>
    resourceRequest<T>(enc(doctype), { method: 'POST', body: doc }),
  update: <T>(doctype: string, name: string, doc: Record<string, unknown>) =>
    resourceRequest<T>(`${enc(doctype)}/${enc(name)}`, { method: 'PUT', body: doc }),
  remove: (doctype: string, name: string) =>
    resourceRequest<{ name?: string }>(`${enc(doctype)}/${enc(name)}`, { method: 'DELETE' }),
}

// --- Focus timer sync (backend-persisted, cross-device) -------------------
const FOCUS = 'vernon_project.api.focus.'

export type FocusRow = {
  taskId: string
  taskTitle: string
  estimatedMs: number
  status: 'idle' | 'running' | 'paused'
  startedAt: number
  elapsedBeforeMs: number
  note: string
  meta: import('./focusUI').FocusMeta | null
}

export const focusApi = {
  list: () => api.get<FocusRow[]>(FOCUS + 'list_focus'),
  save: (r: {
    task: string
    task_title: string
    estimated_ms: number
    status: 'idle' | 'running' | 'paused'
    started_at_ms: number
    elapsed_before_ms: number
    meta?: unknown
  }) => api.post<FocusRow>(FOCUS + 'save_timer', r),
  setNote: (task: string, note: string) => api.post<FocusRow>(FOCUS + 'set_note', { task, note }),
  stop: (task: string) => api.post<{ ok: boolean }>(FOCUS + 'stop_timer', { task }),
}

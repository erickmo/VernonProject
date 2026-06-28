// Thin client over Frappe's whitelisted-method endpoints.
// Reads -> GET; mutations -> POST with CSRF header.

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

export const mobileApi = {
  bootstrap: () => api.get('vernon_project.api.mobile.bootstrap'),
  dashboard: () => api.get(M + 'get_dashboard'),
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
  updateTodo: (todoId: string, fields: Record<string, unknown>) =>
    api.post<{ status: string; message: string }>(M + 'update_todo', {
      project_item: todoId,
      ...fields,
    }),
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
  }) =>
    api.post<{ name: string }>(M + 'create_user', {
      email: payload.email,
      full_name: payload.full_name,
      roles: JSON.stringify(payload.roles),
      send_welcome: payload.send_welcome ? 1 : 0,
    }),
  updateUser: (user: string, payload: import('./types').UserFormPayload) =>
    api.post<{ name: string }>(M + 'update_user', {
      user,
      full_name: payload.full_name,
      roles: JSON.stringify(payload.roles),
      enabled: payload.enabled,
    }),
  resetUserPassword: (user: string) =>
    api.post<{ ok: boolean }>(M + 'reset_user_password', { user }),
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
  getLeaderboard: (period: string, brand?: string | null) =>
    api.get(M + 'get_leaderboard', { period, ...(brand ? { brand } : {}) }),
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
  giftPoints: (toUser: string, amount: number, note?: string) =>
    api.post<{ balance: number; gifted: number; to: string }>(M + 'gift_points', {
      to_user: toUser,
      amount,
      ...(note ? { note } : {}),
    }),
  listGiftRecipients: () =>
    api.get<{ users: import('./types').GiftUser[] }>(M + 'list_gift_recipients'),
  getBadgeSettings: () =>
    api.get<{ tiers: import('./types').BadgeTierInput[] }>(M + 'get_badge_settings'),
  saveBadgeSettings: (tiers: import('./types').BadgeTierInput[]) =>
    api.post<{ ok: boolean }>(M + 'save_badge_settings', { tiers: JSON.stringify(tiers) }),
  getAppSettings: () => api.get<import('./types').AppSettings>(M + 'get_app_settings'),
  saveAppSettings: (settings: Partial<import('./types').AppSettings>) =>
    api.post<import('./types').AppSettings>(
      M + 'save_app_settings',
      settings as Record<string, unknown>,
    ),
  getNotifications: (limit = 30) =>
    api.get<import('./types').NotificationsResponse>(M + 'get_notifications', { limit }),
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
  markMeetingDone: (meeting: string) =>
    api.post<{ status: string; message: string }>(M + 'mark_meeting_done', { meeting }),
  reopenMeeting: (meeting: string) =>
    api.post<{ status: string; message: string }>(M + 'reopen_meeting', { meeting }),
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
    api.post<{ balance: number }>(M + 'buy_avatar_asset', { asset_name }),
  getMyAvatar: () =>
    api.get<import('./types').AvatarConfig>(M + 'get_my_avatar'),
  saveMyAvatar: (config: import('./types').AvatarConfig, snapshot_dataurl?: string) =>
    api.post<import('./types').AvatarConfig>(M + 'save_my_avatar', {
      config_json: JSON.stringify(config),
      snapshot_dataurl,
    }),
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
  requestException: (from_date: string, to_date: string, exception_type: 'WFH' | 'Leave', reason?: string) =>
    api.post<{ status: string; message?: string; name?: string }>(A + 'request_exception', {
      from_date,
      to_date,
      exception_type,
      reason,
    }),
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

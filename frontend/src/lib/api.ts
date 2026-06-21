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

export const mobileApi = {
  bootstrap: () => api.get('vernon_project.api.mobile.bootstrap'),
  dashboard: () => api.get(M + 'get_dashboard'),
  projects: () => api.get(M + 'get_projects'),
  project: (name: string) => api.get(M + 'get_project', { project: name }),
  projectGantt: (project: string) => api.get(M + 'get_project_gantt', { project }),
  projectDetail: (name: string) =>
    api.get(M + 'get_project_detail', { project_detail: name }),
  memberWorkload: (project: string, user: string, includeCompleted: boolean) =>
    api.get(M + 'get_member_workload', {
      project,
      user,
      include_completed: includeCompleted ? 1 : 0,
    }),
  projectItem: (name: string) => api.get(M + 'get_project_item', { project_item: name }),
  advanceStatus: (todoId: string) =>
    api.post<{ status: string; message: string }>(
      'vernon_project.api.project_todo.update_status',
      { todo_id: todoId },
    ),
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
  runReport: (report: string, filters: Record<string, unknown>) =>
    api.post(M + 'run_report', { report, filters: JSON.stringify(filters) }),
  getWallet: () => api.get(M + 'get_wallet'),
  getWalletLog: () => api.get(M + 'get_wallet_log'),
  getLeaderboard: (period: string, brand?: string | null) =>
    api.get(M + 'get_leaderboard', { period, ...(brand ? { brand } : {}) }),
  getMarketplace: () => api.get(M + 'get_marketplace'),
  redeemReward: (reward: string) =>
    api.post<{ balance: number; redemption: string }>(M + 'redeem_reward', { reward }),
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

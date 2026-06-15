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
  workItem: (name: string) => api.get(M + 'get_work_item', { work_item: name }),
  todo: (name: string) => api.get(M + 'get_todo', { todo: name }),
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
      todo: todoId,
      ...fields,
    }),
  createTask: (fields: Record<string, unknown>) =>
    api.post('frappe.client.insert', {
      doc: JSON.stringify({
        doctype: 'Project Todo',
        parenttype: 'Project Detail',
        parentfield: 'todo',
        status: '⚪️ Planned',
        ...fields,
      }),
    }),
  reportOptions: () => api.get(M + 'get_report_options'),
  runReport: (report: string, filters: Record<string, unknown>) =>
    api.post(M + 'run_report', { report, filters: JSON.stringify(filters) }),
}

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

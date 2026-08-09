// Patch one todo wherever it lives in the React Query cache, from the server's
// authoritative advance result — so the acted card flips status instantly and the
// spinner/dialog needn't wait on the heavy list/dashboard refetches.
//
// The cache holds a todo in several shapes (a bare array, {todos:[...]}, nested
// project→detail→todo, or a single detail object), so we walk generically and
// patch any object whose `name` matches AND that carries a `status_key` (the mark
// of a todo record). New object references are returned only along the changed
// path, so React Query re-renders just the affected queries.
export function patchTodoInCache(
  data: unknown,
  id: string,
  patch: Record<string, unknown>,
): unknown {
  if (Array.isArray(data)) {
    let changed = false
    const out = data.map((v) => {
      const nv = patchTodoInCache(v, id, patch)
      if (nv !== v) changed = true
      return nv
    })
    return changed ? out : data
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (obj.name === id && 'status_key' in obj) return { ...obj, ...patch }
    let changed = false
    const out: Record<string, unknown> = {}
    for (const k in obj) {
      const nv = patchTodoInCache(obj[k], id, patch)
      if (nv !== obj[k]) changed = true
      out[k] = nv
    }
    return changed ? out : data
  }
  return data
}

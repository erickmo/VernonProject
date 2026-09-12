// k9b82d4lkh: the todo form's side of the Coding brief. The questions are NOT
// defined here — they come from the server (get_coding_brief_schema), which
// returns the same tuple the controller validates and renders with, so the form
// can never ask for a field the server does not require. These helpers only move
// answers between the form and the JSON stored on Project Todo.coding_brief.

export type BriefField = {
  key: string
  label: string
  required: boolean
  rows: number
  placeholder: string
}
export type Brief = Record<string, string>

/** Stored JSON -> answers. Unreadable or empty reads as "no brief" rather than
 *  throwing: a malformed value must not break the form for an existing todo. */
export function parseBrief(raw: string | null | undefined, fields: BriefField[]): Brief {
  let data: unknown = null
  if (raw && raw.trim()) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = null
    }
  }
  const obj = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  const out: Brief = {}
  for (const f of fields) out[f.key] = String(obj[f.key] ?? '').trim()
  return out
}

/** Answers -> the value to store. Every question gets a key (blank if unanswered),
 *  written in schema order rather than in whatever order the form's state object
 *  happens to hold, so re-serializing an unchanged brief produces the same string.
 *  The controller rewrites it in its own canonical form on save; this only has to
 *  be stable, not byte-identical to Python's. */
export function serializeBrief(brief: Brief, fields: BriefField[]): string {
  const out: Brief = {}
  for (const key of fields.map((f) => f.key)) out[key] = (brief[key] ?? '').trim()
  return JSON.stringify(out)
}

/** The required questions still blank, in the order they are asked — the same
 *  rule the controller enforces, so the inline error matches the server's. */
export function missingBrief(brief: Brief, fields: BriefField[]): BriefField[] {
  return fields.filter((f) => f.required && !(brief[f.key] ?? '').trim())
}

/** True once any question has an answer — the form uses this to know whether a
 *  half-filled brief is worth keeping when the group changes. */
export const hasAnyAnswer = (brief: Brief) => Object.values(brief).some((v) => (v ?? '').trim() !== '')

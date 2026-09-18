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

/** One row of the group/type/level catalog, narrowed to what this decision needs.
 *  Structural so both the API type and a test fixture satisfy it. */
export type CodingLevelRow = {
  group: string
  level_id: string
  group_type?: string
  is_coding?: number
}

/** Whether the chosen group + type/level is coding work, and so takes the
 *  structured brief instead of a free-form note (k9b82d4lkh).
 *
 *  The tag lives at two grains and either one is enough:
 *    - the chosen LEVEL's own `is_coding` — per type and level, so one group can
 *      hold both coding and non-coding work. Preferred, and authoritative when a
 *      level is chosen: an untagged level in a Coding group is still not coding.
 *    - the group-wide `group_type === 'Coding'` — what shipped first, and what
 *      answers while no level is chosen yet.
 *
 *  Reads the catalog the picker already holds, so it costs no extra request, and
 *  mirrors `Project Todo.is_coding_work()` so the form and the server agree. */
export function isCodingWork(
  rows: CodingLevelRow[] | undefined,
  group: string | null | undefined,
  levelId?: string | null,
): boolean {
  if (!group) return false
  const all = rows ?? []
  if (levelId) {
    const row = all.find((r) => r.level_id === levelId)
    // An unknown level_id falls through to the group flag rather than reading as
    // "not coding": the catalog may simply not have loaded yet.
    if (row) return !!row.is_coding || row.group_type === 'Coding'
  }
  return all.some((r) => r.group === group && r.group_type === 'Coding')
}

import { useMemo } from 'react'
import { useCodingBriefSchema } from '@/hooks/useData'
import { missingBrief, parseBrief, serializeBrief, type Brief, type BriefField } from '@/lib/codingBrief'

// k9b82d4lkh: a Coding group's todo answers a short set of questions instead of
// carrying a free-form note. The questions come from the server (one definition,
// shared with the controller that enforces them), and the answers are stored as
// JSON on Project Todo.coding_brief — the note itself is rendered server-side, so
// nothing here writes a note.
//
// Shared by /m and /w: frontend-web aliases @ to ../frontend/src.

export function CodingBrief({
  value,
  onChange,
  showErrors = false,
  className = '',
}: {
  /** The stored JSON (Project Todo.coding_brief). */
  value: string
  onChange: (json: string) => void
  /** Set once the form has been submitted, so errors appear on submit, not while typing. */
  showErrors?: boolean
  className?: string
}) {
  const { data: schema } = useCodingBriefSchema()
  const fields: BriefField[] = schema?.fields ?? []
  const brief = useMemo(() => parseBrief(value, fields), [value, fields])
  const missing = useMemo(() => new Set(missingBrief(brief, fields).map((f) => f.key)), [brief, fields])

  if (!fields.length) return null

  const set = (key: string, next: string) => onChange(serializeBrief({ ...brief, [key]: next }, fields))

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        This work type uses a coding brief. The note is written from these answers.
      </p>
      {fields.map((f) => {
        const bad = showErrors && missing.has(f.key)
        const errorId = `coding-brief-${f.key}-error`
        return (
          <label key={f.key} className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {f.label}
            {f.required && <span className="text-red-500"> *</span>}
            <textarea
              rows={f.rows}
              value={brief[f.key] ?? ''}
              placeholder={f.placeholder}
              aria-required={f.required}
              aria-invalid={bad || undefined}
              aria-describedby={bad ? errorId : undefined}
              onChange={(e) => set(f.key, e.target.value)}
              className={`mt-1 w-full rounded-xl border bg-white p-2 text-sm font-normal text-slate-700 outline-none dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500 ${
                bad
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-slate-200 focus:border-brand-400 dark:border-slate-700'
              }`}
            />
            {bad && (
              <span id={errorId} role="alert" className="mt-0.5 block text-xs font-normal text-red-500">
                {f.label} is required.
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}

/** Whether this brief may be submitted — the same rule the controller enforces,
 *  so the form does not let someone hit a server error it could name itself. */
export const briefIsComplete = (value: string, fields: BriefField[]): boolean =>
  fields.length > 0 && missingBrief(parseBrief(value, fields), fields).length === 0

export type { Brief, BriefField }

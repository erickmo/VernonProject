import { useEffect, useState } from 'react'
import { X, Sparkles, Check } from 'lucide-react'
import { mobileApi } from '@/lib/api'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { GroupLevelPicker, emptyGroupLevel, type GroupLevel } from '@/components/GroupLevelPicker'
import type { BreakdownSubgoal } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  /** The Project to draft against. */
  project: string
  /** When set, draft/persist todos for this ONE subgoal (append, no new detail). */
  projectDetail?: string
  onSaved?: () => void
}

// Editable draft rows. Each todo has an `include` toggle; unchecked = not created.
type DraftTodo = { to_do: string; work_mode?: string; ai_prompt?: string; include: boolean }
type DraftSubgoal = {
  title: string
  goal?: string
  success_condition?: string
  failure_condition?: string
  context?: string
  todos: DraftTodo[]
}

/**
 * "Generate with AI" review sheet. Calls generate_project_breakdown, shows the
 * deterministic draft subgoals + todos, lets the user edit text / toggle todos /
 * pick one group+level for the batch, then persists via persist_project_breakdown.
 * Shared by both frontends (web reuses /m components via @).
 */
export function AiBreakdownSheet({ open, onClose, project, projectDetail, onSaved }: Props) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [drafts, setDrafts] = useState<DraftSubgoal[]>([])
  // One group/level applies to every created todo — the draft can't classify work,
  // so the reviewer picks it once; each task can be re-levelled later in its editor.
  // ponytail: batch-level, per-todo pickers only if reviewers ask for them.
  const [gl, setGl] = useState<GroupLevel>(emptyGroupLevel)

  useEffect(() => {
    if (!open) return
    setDrafts([])
    setGl(emptyGroupLevel)
    setLoading(true)
    mobileApi
      .generateProjectBreakdown(project, projectDetail)
      .then((r) =>
        setDrafts(
          r.subgoals.map((sg) => ({ ...sg, todos: sg.todos.map((t) => ({ ...t, include: true })) })),
        ),
      )
      .catch((e) => toast('error', (e as Error).message))
      .finally(() => setLoading(false))
  }, [open, project, projectDetail])

  if (!open) return null

  const setTodo = (si: number, ti: number, patch: Partial<DraftTodo>) =>
    setDrafts((s) =>
      s.map((sg, i) =>
        i !== si ? sg : { ...sg, todos: sg.todos.map((t, j) => (j === ti ? { ...t, ...patch } : t)) },
      ),
    )
  const setTitle = (si: number, v: string) =>
    setDrafts((s) => s.map((sg, i) => (i === si ? { ...sg, title: v } : sg)))

  const chosen = drafts.some((sg) => sg.todos.some((t) => t.include && t.to_do.trim()))

  const save = () => {
    if (!chosen) {
      toast('error', 'Pick at least one task to create')
      return
    }
    if (!gl.levelId) {
      toast('error', 'Choose a group / level for the tasks first')
      return
    }
    const payload = drafts.map((sg) => ({
      title: sg.title,
      goal: sg.goal,
      success_condition: sg.success_condition,
      failure_condition: sg.failure_condition,
      context: sg.context,
      todos: sg.todos
        .filter((t) => t.include && t.to_do.trim())
        .map((t) => ({
          to_do: t.to_do,
          work_mode: t.work_mode,
          ai_prompt: t.ai_prompt,
          group: gl.group,
          level: gl.typeName,
          level_id: gl.levelId,
        })),
    })) as (BreakdownSubgoal & { todos: unknown[] })[]
    setSaving(true)
    mobileApi
      .persistProjectBreakdown(project, JSON.stringify(payload), projectDetail)
      .then((r) => {
        toast(
          'success',
          projectDetail
            ? `Added ${r.created_todos} task(s)`
            : `Created ${r.created_details.length} subgoal(s), ${r.created_todos} task(s)`,
        )
        onSaved?.()
        onClose()
      })
      .catch((e) => toast('error', (e as Error).message))
      .finally(() => setSaving(false))
  }

  const field =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-50">
            <Sparkles className="h-5 w-5 text-brand-600" />
            {projectDetail ? 'Generate tasks with AI' : 'Generate plan with AI'}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          Drafts from the goal, success &amp; failure conditions and context. Edit, untick what you
          don&apos;t want, pick a group/level, then save. Nothing is created until you save.
        </p>

        {loading ? (
          <Spinner className="mx-auto my-10 h-6 w-6 text-slate-400 dark:text-slate-500" />
        ) : drafts.length === 0 ? (
          <p className="my-8 text-center text-sm text-slate-400 dark:text-slate-500">
            No drafts — add a goal / success / failure / context first.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {drafts.map((sg, si) => (
              <div
                key={si}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3"
              >
                {!projectDetail && (
                  <input
                    className={field + ' mb-2 font-semibold'}
                    value={sg.title}
                    onChange={(e) => setTitle(si, e.target.value)}
                  />
                )}
                <div className="flex flex-col gap-2">
                  {sg.todos.map((t, ti) => (
                    <label key={ti} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={t.include}
                        onChange={(e) => setTodo(si, ti, { include: e.target.checked })}
                        className="mt-2 h-4 w-4 shrink-0 accent-brand-600"
                      />
                      <input
                        className={field + (t.include ? '' : ' opacity-40')}
                        value={t.to_do}
                        onChange={(e) => setTodo(si, ti, { to_do: e.target.value })}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <GroupLevelPicker value={gl} onChange={setGl} />

            <button
              onClick={save}
              disabled={saving}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

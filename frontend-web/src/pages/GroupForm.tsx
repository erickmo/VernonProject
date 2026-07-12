import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import { ArrowLeft, Trash2, Check, ListChecks, ChevronRight, Info, Plus, Minus, Layers } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { MergeIntoCard } from '@/components/MergeIntoCard'
import { deleteErrorMessage, formatDate } from '@/lib/format'
import {
  useScoringGroup,
  useScoringGroups,
  useCreateScoringGroup,
  useUpdateScoringGroup,
  useDeleteScoringGroup,
  useMergeScoringGroup,
  useGroupTodos,
  useBoot,
  canManageGroups,
} from '@/hooks/useData'
import type { GroupLevel, ScoringGroupPayload } from '@/lib/types'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

const WEIGHTS: { key: keyof ScoringGroupPayload; label: string; group: 'Assignee' | 'Leader' }[] = [
  { key: 'late_penalty', label: 'Late penalty % / day', group: 'Assignee' },
  { key: 'early_bonus', label: 'Early bonus % / day', group: 'Assignee' },
  { key: 'leader_weight', label: 'Leader weight % (on-time / early)', group: 'Leader' },
  { key: 'leader_late_weight', label: 'Leader late weight % (late)', group: 'Leader' },
]

type LevelRow = { _key: string; name?: string; level_id?: string; type_name: string; level_name: string; difficulty_percent: number }

let _tmp = 0
const tmpKey = () => `new-${_tmp++}`
const rowKey = (l: { level_id?: string; name?: string }) => l.level_id || l.name || tmpKey()

const defaultLevels = (): LevelRow[] => [{ _key: tmpKey(), type_name: 'New Type', level_name: 'Standard', difficulty_percent: 100 }]

type TypeGroup = { type_name: string; rows: LevelRow[]; _groupKey: string }

function groupByType(levels: LevelRow[]): TypeGroup[] {
  const order: string[] = []
  const map: Record<string, LevelRow[]> = {}
  for (const l of levels) {
    if (!map[l.type_name]) {
      order.push(l.type_name)
      map[l.type_name] = []
    }
    map[l.type_name].push(l)
  }
  return order.map((t) => ({ type_name: t, rows: map[t], _groupKey: map[t][0]._key }))
}

export default function GroupForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? safeDecode(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useScoringGroup(name, isEdit)
  const create = useCreateScoringGroup()
  const update = useUpdateScoringGroup()
  const del = useDeleteScoringGroup()
  const merge = useMergeScoringGroup()
  const { data: allGroups } = useScoringGroups()
  const { data: linkedTodos, isLoading: todosLoading } = useGroupTodos(name, isEdit)

  type FormState = Omit<ScoringGroupPayload, 'levels'> & { levels: LevelRow[] }
  const [form, setForm] = useState<FormState>({
    group_name: '',
    description: '',
    base_rate_per_minute: 1,
    late_penalty: 0,
    early_bonus: 0,
    leader_weight: 0,
    leader_late_weight: 0,
    levels: defaultLevels(),
  })

  const [dirty, setDirty] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        group_name: existing.group_name,
        description: existing.description ?? '',
        base_rate_per_minute: existing.base_rate_per_minute ?? 1,
        late_penalty: existing.late_penalty ?? 0,
        early_bonus: existing.early_bonus ?? 0,
        leader_weight: existing.leader_weight ?? 0,
        leader_late_weight: existing.leader_late_weight ?? 0,
        levels: (existing.levels ?? [])
          .slice()
          .sort((a: GroupLevel, b: GroupLevel) => (a.idx ?? 0) - (b.idx ?? 0))
          .map((l: GroupLevel) => ({
            _key: rowKey(l),
            name: l.name,
            level_id: l.level_id,
            type_name: l.type_name,
            level_name: l.level_name,
            difficulty_percent: l.difficulty_percent,
          })),
      })
    }
  }, [isEdit, existing])

  const blocked = !boot ? false : !canManageGroups(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  // All hooks must run before any early return (React hooks order).
  const types = useMemo(() => groupByType(form.levels), [form.levels])

  if (blocked) return null

  if (isEdit && isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (isEdit && !isLoading && !existing) {
    return (
      <ErrorState
        title="Not found"
        subtitle="This group could not be found. It may have been deleted."
        onRetry={() => navigate('/groups')}
      />
    )
  }

  const setNum = (key: keyof ScoringGroupPayload, v: string) => {
    setDirty(true)
    setForm((f) => ({ ...f, [key]: v === '' ? 0 : Number(v) }))
  }

  const LEVEL_STEP = 5

  // Patch a row by _key (stable across grouping)
  const patchByKey = (key: string, patch: Partial<LevelRow>) => {
    setDirty(true)
    setForm((f) => ({ ...f, levels: f.levels.map((l) => (l._key === key ? { ...l, ...patch } : l)) }))
  }

  const setLevelName = (key: string, level_name: string) => patchByKey(key, { level_name })
  const setLevelDifficulty = (key: string, difficulty_percent: number) => patchByKey(key, { difficulty_percent })
  const bumpLevelDifficulty = (key: string, delta: number) => {
    setDirty(true)
    setForm((f) => ({
      ...f,
      levels: f.levels.map((l) =>
        l._key === key ? { ...l, difficulty_percent: Math.max(0, (Number(l.difficulty_percent) || 0) + delta) } : l,
      ),
    }))
  }

  // Rename type_name on ALL rows belonging to oldName
  const renameType = (oldName: string, newName: string) => {
    setDirty(true)
    setForm((f) => ({
      ...f,
      levels: f.levels.map((l) => (l.type_name === oldName ? { ...l, type_name: newName } : l)),
    }))
  }

  // Add a new level row under an existing type
  const addLevelToType = (type_name: string) => {
    setDirty(true)
    setForm((f) => {
      // insert after the last row of this type
      const lastIdx = f.levels.reduce((acc, l, i) => (l.type_name === type_name ? i : acc), -1)
      const newRow: LevelRow = { _key: tmpKey(), type_name, level_name: 'Standard', difficulty_percent: 100 }
      const next = f.levels.slice()
      next.splice(lastIdx + 1, 0, newRow)
      return { ...f, levels: next }
    })
  }

  // Remove a single level row by _key
  const removeLevelByKey = (key: string) => {
    setDirty(true)
    setForm((f) => ({ ...f, levels: f.levels.filter((l) => l._key !== key) }))
  }

  // Remove all rows for a type
  const removeType = (type_name: string) => {
    setDirty(true)
    setForm((f) => ({ ...f, levels: f.levels.filter((l) => l.type_name !== type_name) }))
  }

  // Add a whole new type (one row with fresh unique type_name)
  const addType = () => {
    setDirty(true)
    const existingTypes = new Set(form.levels.map((l) => l.type_name))
    let candidate = 'New Type'
    let n = 2
    while (existingTypes.has(candidate)) candidate = `New Type ${n++}`
    setForm((f) => ({
      ...f,
      levels: [...f.levels, { _key: tmpKey(), type_name: candidate, level_name: 'Standard', difficulty_percent: 100 }],
    }))
  }

  const goBack = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Leave without saving?',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
      })
      if (!ok) return
    }
    navigate('/groups')
  }

  const validate = (): string | null => {
    if (!form.group_name.trim()) return 'Group name is required'
    if (form.levels.length === 0) return 'Add at least one level'
    const pairs = new Set<string>()
    for (const l of form.levels) {
      const tn = l.type_name.trim()
      const ln = l.level_name.trim()
      if (!tn) return 'Type names cannot be empty'
      if (!ln) return 'Level names cannot be empty'
      const pair = `${tn}|||${ln}`
      if (pairs.has(pair)) return `Duplicate level "${ln}" in type "${tn}"`
      pairs.add(pair)
      if (typeof l.difficulty_percent !== 'number' || isNaN(l.difficulty_percent)) return 'Difficulty must be a number'
      if (l.difficulty_percent < 0) return 'Difficulty cannot be negative'
    }
    return null
  }

  const save = () => {
    const err = validate()
    if (err) {
      if (!form.group_name.trim()) setNameError('Group name is required')
      toast('error', err)
      return
    }
    setNameError('')
    const payload: ScoringGroupPayload = {
      ...form,
      group_name: form.group_name.trim(),
      description: (form.description ?? '').trim(),
      base_rate_per_minute: Number(form.base_rate_per_minute),
      levels: form.levels.map((l) => ({
        name: l.name,
        level_id: l.level_id,
        type_name: l.type_name.trim(),
        level_name: l.level_name.trim(),
        difficulty_percent: Number(l.difficulty_percent),
      })),
    }
    const opts = {
      onSuccess: () => {
        toast('success', isEdit ? 'Group updated' : 'Group created')
        navigate('/groups')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    if (isEdit) update.mutate({ name, payload }, opts)
    else create.mutate(payload, opts)
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this group?', confirmLabel: 'Delete', destructive: true })))
      return
    del.mutate(name, {
      onSuccess: () => {
        toast('success', 'Group deleted')
        navigate('/groups')
      },
      onError: (e) => toast('error', deleteErrorMessage(e, 'group')),
    })
  }

  const doMerge = (target: string) =>
    merge.mutate(
      { source: name, target },
      {
        onSuccess: () => {
          toast('success', 'Groups merged')
          navigate('/groups')
        },
        onError: (e) => toast('error', (e as Error).message),
      },
    )

  const mergeOptions = (allGroups ?? [])
    .filter((g) => g.name !== name)
    .map((g) => ({ value: g.name, label: g.group_name }))

  const saving = create.isPending || update.isPending

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Groups
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{isEdit ? 'Edit group' : 'New group'}</h1>
      </div>

      <BentoGrid>
        {/* Main form tile */}
        <BentoTile span="wide" tone="plain">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Group name"
                required={!isEdit}
                error={nameError}
                hint={isEdit ? "Can't be changed after creation" : undefined}
              >
                {(id) => (
                  <input
                    id={id}
                    className={field + (isEdit ? ' bg-canvas text-muted' : '')}
                    value={form.group_name}
                    readOnly={isEdit}
                    autoFocus={!isEdit}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, group_name: e.target.value }))
                      setDirty(true)
                      if (nameError) setNameError('')
                    }}
                    placeholder="e.g. Frontend"
                  />
                )}
              </Field>

              <Field label="Description">
                {(id) => (
                  <textarea
                    id={id}
                    className={field}
                    rows={2}
                    autoFocus={isEdit}
                    value={form.description}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, description: e.target.value }))
                      setDirty(true)
                    }}
                  />
                )}
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(['Assignee', 'Leader'] as const).map((grp) => (
                <div key={grp} className="rounded-xl bg-canvas p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{grp}</p>
                  <div className="flex flex-col gap-2">
                    {WEIGHTS.filter((w) => w.group === grp).map((w) => (
                      <div key={w.key} className="flex items-center gap-3">
                        <label className="min-w-0 flex-1 text-sm font-medium text-ink dark:text-slate-200">{w.label}</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          className="w-16 shrink-0 rounded-xl border border-line px-1.5 py-2 text-center text-sm text-ink bg-hover/[0.04] focus:border-brand-600 focus:outline-none"
                          value={String(form[w.key] as number)}
                          onChange={(e) => setNum(w.key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <label className="min-w-0 flex-1 text-sm font-medium text-ink dark:text-slate-200">Base rate (points / minute)</label>
              <input
                type="number"
                inputMode="decimal"
                className="w-20 shrink-0 rounded-xl border border-line px-1.5 py-2 text-center text-sm text-ink bg-hover/[0.04] focus:border-brand-600 focus:outline-none"
                value={String(form.base_rate_per_minute)}
                onChange={(e) => setNum('base_rate_per_minute', e.target.value)}
              />
            </div>

            {/* Types & Levels */}
            <div className="rounded-xl bg-canvas p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                <Layers className="h-3.5 w-3.5" /> Types &amp; Levels
              </p>
              <p className="mb-3 text-[11px] text-muted">
                Organise difficulty levels into named types. Each type can have multiple levels with their own difficulty %.
              </p>

              <div className="flex flex-col gap-3">
                {types.map(({ type_name, rows, _groupKey }) => (
                  <div key={_groupKey} className="rounded-xl border border-line bg-surface p-3 dark:border-slate-700">
                    {/* Type header: editable name + remove-type */}
                    <div className="mb-2 flex items-center gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none"
                        value={type_name}
                        onChange={(e) => renameType(type_name, e.target.value)}
                        placeholder="Type name"
                      />
                      <button
                        type="button"
                        aria-label="Remove type"
                        onClick={() => removeType(type_name)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-red-500 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Level rows for this type */}
                    <div className="flex flex-col gap-2">
                      {rows.map((l) => (
                        <div key={l._key} className="flex items-center gap-2">
                          <input
                            className={field + ' flex-1'}
                            value={l.level_name}
                            onChange={(e) => setLevelName(l._key, e.target.value)}
                            placeholder="Level name"
                          />
                          <button
                            type="button"
                            aria-label="Decrease difficulty"
                            onClick={() => bumpLevelDifficulty(l._key, -LEVEL_STEP)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-muted hover:bg-hover/[0.04] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <input
                            type="number"
                            inputMode="decimal"
                            className="w-16 shrink-0 rounded-xl border border-line px-2 py-2 text-center text-sm text-ink bg-hover/[0.04] focus:border-brand-600 focus:outline-none"
                            value={String(l.difficulty_percent)}
                            onChange={(e) => setLevelDifficulty(l._key, e.target.value === '' ? 0 : Number(e.target.value))}
                            placeholder="Difficulty %"
                          />
                          <button
                            type="button"
                            aria-label="Increase difficulty"
                            onClick={() => bumpLevelDifficulty(l._key, LEVEL_STEP)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-muted hover:bg-hover/[0.04] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Remove level"
                            onClick={() => removeLevelByKey(l._key)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-red-500 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add level to this type */}
                    <button
                      type="button"
                      onClick={() => addLevelToType(type_name)}
                      className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-line py-2 text-xs font-medium text-muted hover:bg-hover/[0.04] dark:border-slate-600 dark:hover:bg-slate-800/60"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add level
                    </button>
                  </div>
                ))}
              </div>

              {/* Add type */}
              <button
                type="button"
                onClick={addType}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-line py-2 text-sm font-medium text-muted hover:bg-hover/[0.04] dark:border-slate-600 dark:hover:bg-slate-800/60"
              >
                <Plus className="h-4 w-4" /> Add type
              </button>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {isEdit ? 'Save changes' : 'Create group'}
            </button>
          </form>
        </BentoTile>

        {/* How points are scored info tile */}
        <BentoTile span="md" tone="tint" accent="brand">
          <div className="text-xs leading-relaxed text-ink dark:text-slate-300">
            <p className="mb-1 flex items-center gap-1.5 font-bold uppercase tracking-wide text-muted dark:text-slate-400">
              <Info className="h-3.5 w-3.5" /> How points are scored
            </p>
            <p className="mb-1">
              When a todo is completed, the <b>assignee</b> earns points based on <b>base rate × estimated minutes × difficulty%</b>,
              then adjusted for timing:
            </p>
            <p className="mb-1 rounded-lg bg-white/70 px-2 py-1 font-mono text-[11px] text-ink dark:bg-slate-800/85 dark:text-slate-300">
              assignee = base_rate × minutes × difficulty% × (1 − late_days×late% + early_days×early%)
            </p>
            <p className="mb-1">
              The <b>leader</b> earns a share of the assignee's points — using <b>leader weight</b>
              when the todo is on-time or early, or <b>leader late weight</b> when it's late:
            </p>
            <p className="rounded-lg bg-white/70 px-2 py-1 font-mono text-[11px] text-ink dark:bg-slate-800/85 dark:text-slate-300">
              leader = assignee × (late ? leader_late_weight% : leader_weight%)
            </p>
          </div>
        </BentoTile>

        {/* Linked tasks tile */}
        {isEdit && (
          <BentoTile span="md" tone="plain">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
              <ListChecks className="h-3.5 w-3.5" /> Linked tasks
              {linkedTodos && (
                <span className="ml-0.5 rounded-full bg-line px-1.5 text-[11px] font-bold text-muted dark:bg-slate-700">
                  {linkedTodos.length}
                </span>
              )}
            </p>
            {todosLoading ? (
              <Spinner className="mx-auto my-2 h-4 w-4 text-muted" />
            ) : !linkedTodos || linkedTodos.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted">No tasks use this group.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {linkedTodos.map((t) => (
                  <Link
                    key={t.name}
                    to={`/project-item/${encodeURIComponent(t.name)}`}
                    className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 hover:bg-hover/[0.04] dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{t.to_do || t.name}</p>
                      <p className="truncate text-[11px] text-muted">
                        {t.status}
                        {t.deadline ? ` · ${formatDate(t.deadline)}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted dark:text-slate-600" />
                  </Link>
                ))}
              </div>
            )}
          </BentoTile>
        )}

        {/* Delete / Merge tile */}
        {isEdit && (
          <BentoTile span="md" tone="plain">
            <div className="flex flex-col gap-3">
              <button
                onClick={remove}
                disabled={del.isPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-60 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 transition-colors"
              >
                {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete group
              </button>

              {mergeOptions.length > 0 && (
                <MergeIntoCard
                  entity="group"
                  currentLabel={existing?.group_name || name}
                  options={mergeOptions}
                  isPending={merge.isPending}
                  onConfirm={doMerge}
                />
              )}
            </div>
          </BentoTile>
        )}
      </BentoGrid>
    </div>
  )
}

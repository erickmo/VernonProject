import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Trash2, Check, ListChecks, ChevronRight, Info, Plus, Minus, Layers } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
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
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

const WEIGHTS: { key: keyof ScoringGroupPayload; label: string; group: 'Assignee' | 'Leader' }[] = [
  { key: 'late_penalty', label: 'Late penalty % / day', group: 'Assignee' },
  { key: 'early_bonus', label: 'Early bonus % / day', group: 'Assignee' },
  { key: 'leader_weight', label: 'Leader weight %', group: 'Leader' },
  { key: 'leader_late_penalty', label: 'Leader late penalty % / day', group: 'Leader' },
  { key: 'leader_early_bonus', label: 'Leader early bonus % / day', group: 'Leader' },
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

export default function GroupFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
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
    leader_late_penalty: 0,
    leader_early_bonus: 0,
    levels: defaultLevels(),
  })

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        group_name: existing.group_name,
        description: existing.description ?? '',
        base_rate_per_minute: existing.base_rate_per_minute ?? 1,
        late_penalty: existing.late_penalty ?? 0,
        early_bonus: existing.early_bonus ?? 0,
        leader_weight: existing.leader_weight ?? 0,
        leader_late_penalty: existing.leader_late_penalty ?? 0,
        leader_early_bonus: existing.leader_early_bonus ?? 0,
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

  // Access gate: redirect outside render (useEffect-safe pattern)
  const blocked = !boot ? false : !canManageGroups(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  if (isEdit && isLoading) {
    return (
      <DetailScreen title="Group">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const setNum = (key: keyof ScoringGroupPayload, v: string) =>
    setForm((f) => ({ ...f, [key]: v === '' ? 0 : Number(v) }))

  const LEVEL_STEP = 5

  // Patch a row by _key (stable across grouping)
  const patchByKey = (key: string, patch: Partial<LevelRow>) =>
    setForm((f) => ({ ...f, levels: f.levels.map((l) => (l._key === key ? { ...l, ...patch } : l)) }))

  const setLevelName = (key: string, level_name: string) => patchByKey(key, { level_name })
  const setLevelDifficulty = (key: string, difficulty_percent: number) => patchByKey(key, { difficulty_percent })
  const bumpLevelDifficulty = (key: string, delta: number) =>
    setForm((f) => ({
      ...f,
      levels: f.levels.map((l) =>
        l._key === key ? { ...l, difficulty_percent: Math.max(0, (Number(l.difficulty_percent) || 0) + delta) } : l,
      ),
    }))

  // Rename type_name on ALL rows belonging to oldName
  const renameType = (oldName: string, newName: string) =>
    setForm((f) => ({
      ...f,
      levels: f.levels.map((l) => (l.type_name === oldName ? { ...l, type_name: newName } : l)),
    }))

  // Add a new level row under an existing type
  const addLevelToType = (type_name: string) =>
    setForm((f) => {
      // insert after the last row of this type
      const lastIdx = f.levels.reduce((acc, l, i) => (l.type_name === type_name ? i : acc), -1)
      const newRow: LevelRow = { _key: tmpKey(), type_name, level_name: 'Standard', difficulty_percent: 100 }
      const next = f.levels.slice()
      next.splice(lastIdx + 1, 0, newRow)
      return { ...f, levels: next }
    })

  // Remove a single level row by _key
  const removeLevelByKey = (key: string) =>
    setForm((f) => ({ ...f, levels: f.levels.filter((l) => l._key !== key) }))

  // Remove all rows for a type
  const removeType = (type_name: string) =>
    setForm((f) => ({ ...f, levels: f.levels.filter((l) => l.type_name !== type_name) }))

  // Add a whole new type (one row with fresh unique type_name)
  const addType = () => {
    const existingTypes = new Set(form.levels.map((l) => l.type_name))
    let candidate = 'New Type'
    let n = 2
    while (existingTypes.has(candidate)) candidate = `New Type ${n++}`
    setForm((f) => ({
      ...f,
      levels: [...f.levels, { _key: tmpKey(), type_name: candidate, level_name: 'Standard', difficulty_percent: 100 }],
    }))
  }

  const types = useMemo(() => groupByType(form.levels), [form.levels])

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
      toast('error', err)
      return
    }
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
    <DetailScreen title={isEdit ? 'Edit group' : 'New group'}>
      <div className="flex flex-col gap-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          <Layers className="h-6 w-6" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Group name</label>
          <input
            className={field + (isEdit ? ' bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' : '')}
            value={form.group_name}
            readOnly={isEdit}
            onChange={(e) => setForm((f) => ({ ...f, group_name: e.target.value }))}
            placeholder="e.g. Frontend"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Description</label>
          <textarea
            className={field}
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">Base rate (points / minute)</label>
          <input
            type="number"
            inputMode="decimal"
            className="w-20 shrink-0 rounded-xl border border-slate-200 px-1.5 py-2 text-center text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            value={String(form.base_rate_per_minute)}
            onChange={(e) => setNum('base_rate_per_minute', e.target.value)}
          />
        </div>

        {/* How scoring works */}
        <div className="rounded-2xl border border-slate-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900 dark:border-slate-700 dark:bg-emerald-500/15 dark:text-emerald-200">
          <p className="mb-1 flex items-center gap-1.5 font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <Info className="h-3.5 w-3.5" /> How points are scored
          </p>
          <p className="mb-1">
            When a todo is completed, the <b>assignee</b> earns points based on{' '}
            <b>base rate × estimated minutes × difficulty%</b>, then adjusted for timing:
          </p>
          <p className="mb-1 rounded-lg bg-white px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            assignee = base_rate × minutes × difficulty% × (1 − late_days×late% + early_days×early%)
          </p>
          <p className="mb-1">
            The <b>leader</b> earns a share of the assignee's points:
          </p>
          <p className="rounded-lg bg-white px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            leader = assignee × (leader% − late_days×lead_late% + early_days×lead_early%)
          </p>
        </div>

        {(['Assignee', 'Leader'] as const).map((grp) => (
          <div key={grp} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{grp}</p>
            <div className="flex flex-col gap-2">
              {WEIGHTS.filter((w) => w.group === grp).map((w) => (
                <div key={w.key} className="flex items-center gap-3">
                  <label className="min-w-0 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{w.label}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="w-14 shrink-0 rounded-xl border border-slate-200 px-1.5 py-2 text-center text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                    value={String(form[w.key] as number)}
                    onChange={(e) => setNum(w.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Types & Levels */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Types &amp; Levels</p>
          <p className="mb-3 text-[11px] text-slate-400 dark:text-slate-500">
            Organise difficulty levels into named types. Each type can have multiple levels with their own difficulty %.
          </p>

          <div className="flex flex-col gap-3">
            {types.map(({ type_name, rows, _groupKey }) => (
              <div key={_groupKey} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                {/* Type header: editable name + remove-type */}
                <div className="mb-2 flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                    value={type_name}
                    onChange={(e) => renameType(type_name, e.target.value)}
                    placeholder="Type name"
                  />
                  <button
                    type="button"
                    aria-label="Remove type"
                    onClick={() => removeType(type_name)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-red-500 active:scale-95 dark:border-slate-700 dark:hover:bg-red-500/10"
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
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 active:scale-95 dark:border-slate-700 dark:text-slate-300"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="w-16 shrink-0 rounded-xl border border-slate-200 px-2 py-2 text-center text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                        value={String(l.difficulty_percent)}
                        onChange={(e) => setLevelDifficulty(l._key, e.target.value === '' ? 0 : Number(e.target.value))}
                        placeholder="Difficulty %"
                      />
                      <button
                        type="button"
                        aria-label="Increase difficulty"
                        onClick={() => bumpLevelDifficulty(l._key, LEVEL_STEP)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 active:scale-95 dark:border-slate-700 dark:text-slate-300"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove level"
                        onClick={() => removeLevelByKey(l._key)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-red-500 active:scale-95 dark:border-slate-700 dark:hover:bg-red-500/10"
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
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 active:scale-95 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800/60"
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
            className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-500 active:scale-95 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800/60"
          >
            <Plus className="h-4 w-4" /> Add type
          </button>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isEdit ? 'Save changes' : 'Create group'}
        </button>

        {isEdit && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <ListChecks className="h-3.5 w-3.5" /> Linked tasks
              {linkedTodos && (
                <span className="ml-0.5 rounded-full bg-slate-200 px-1.5 text-[11px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  {linkedTodos.length}
                </span>
              )}
            </p>
            {todosLoading ? (
              <Spinner className="mx-auto my-2 h-4 w-4 text-slate-400" />
            ) : !linkedTodos || linkedTodos.length === 0 ? (
              <p className="py-2 text-center text-xs text-slate-400 dark:text-slate-500">No tasks use this group.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {linkedTodos.map((t) => (
                  <Link
                    key={t.name}
                    to={`/project-item/${encodeURIComponent(t.name)}`}
                    className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm active:scale-[0.99] dark:bg-slate-800"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{t.to_do || t.name}</p>
                      <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                        {t.status}
                        {t.deadline ? ` · ${formatDate(t.deadline)}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {isEdit && (
          <button
            onClick={remove}
            disabled={del.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:bg-rose-50 disabled:opacity-60 dark:bg-slate-800 dark:active:bg-rose-500/15"
          >
            {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete group
          </button>
        )}

        {isEdit && mergeOptions.length > 0 && (
          <MergeIntoCard
            entity="group"
            currentLabel={existing?.group_name || name}
            options={mergeOptions}
            isPending={merge.isPending}
            onConfirm={doMerge}
          />
        )}
      </div>
    </DetailScreen>
  )
}

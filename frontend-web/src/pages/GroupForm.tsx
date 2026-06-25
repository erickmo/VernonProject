import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Trash2, Check, ListChecks, ChevronRight, Info, Plus, Minus } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { MergeIntoCard } from '@/components/MergeIntoCard'
import { Sortable } from '@/components/Sortable'
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

type LevelRow = { _key: string; name?: string; level_id?: string; level_name: string; point: number }

let _tmp = 0
const tmpKey = () => `new-${_tmp++}`
const rowKey = (l: { level_id?: string; name?: string }) => l.level_id || l.name || tmpKey()

const defaultLevels = (): LevelRow[] => [{ _key: tmpKey(), level_name: '1', point: 100 }]

export default function GroupForm() {
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
    late_penalty: 0,
    early_bonus: 0,
    leader_weight: 0,
    leader_late_penalty: 0,
    leader_early_bonus: 0,
    levels: defaultLevels(),
  })

  const [stepFill, setStepFill] = useState('')
  const [dirty, setDirty] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        group_name: existing.group_name,
        description: existing.description ?? '',
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
            level_name: l.level_name,
            point: l.point,
          })),
      })
    }
  }, [isEdit, existing])

  const blocked = !boot ? false : !canManageGroups(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

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
  const patchLevel = (i: number, patch: Partial<LevelRow>) => {
    setDirty(true)
    setForm((f) => ({ ...f, levels: f.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  }
  const setLevelName = (i: number, level_name: string) => patchLevel(i, { level_name })
  const setLevelPoint = (i: number, point: number) => patchLevel(i, { point })
  const bumpLevelPoint = (i: number, delta: number) =>
    patchLevel(i, { point: Math.max(0, (Number(form.levels[i].point) || 0) + delta) })
  const addLevel = () => {
    setDirty(true)
    setForm((f) => ({
      ...f,
      levels: [...f.levels, { _key: tmpKey(), level_name: String(f.levels.length + 1), point: 0 }],
    }))
  }
  const removeLevel = (i: number) => {
    setDirty(true)
    setForm((f) => ({ ...f, levels: f.levels.filter((_, j) => j !== i) }))
  }
  const reorderLevel = (from: number, to: number) => {
    setDirty(true)
    setForm((f) => {
      const next = f.levels.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return { ...f, levels: next }
    })
  }
  const applyStepFill = () => {
    const step = Number(stepFill)
    if (!stepFill.trim() || isNaN(step)) {
      toast('error', 'Enter a step value first')
      return
    }
    setDirty(true)
    setForm((f) => ({ ...f, levels: f.levels.map((l, i) => ({ ...l, point: Math.max(0, (i + 1) * step) })) }))
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
    const names = new Set<string>()
    for (const l of form.levels) {
      const nm = l.level_name.trim()
      if (!nm) return 'Level names cannot be empty'
      if (names.has(nm)) return `Duplicate level name: ${nm}`
      names.add(nm)
      if (typeof l.point !== 'number' || isNaN(l.point)) return 'Level points must be numbers'
      if (l.point < 0) return 'Level points cannot be negative'
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
      levels: form.levels.map((l) => ({
        name: l.name,
        level_id: l.level_id,
        level_name: l.level_name.trim(),
        point: Number(l.point),
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
        <h1 className="text-2xl font-bold">{isEdit ? 'Edit group' : 'New group'}</h1>
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
                    className={field + (isEdit ? ' bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' : '')}
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
                <div key={grp} className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{grp}</p>
                  <div className="flex flex-col gap-2">
                    {WEIGHTS.filter((w) => w.group === grp).map((w) => (
                      <div key={w.key} className="flex items-center gap-3">
                        <label className="min-w-0 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{w.label}</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          className="w-16 shrink-0 rounded-xl border border-slate-200 px-1.5 py-2 text-center text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                          value={String(form[w.key] as number)}
                          onChange={(e) => setNum(w.key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Levels</p>
              <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
                Add, rename, set points, delete, or drag to reorder. Todos list levels in this order.
              </p>
              {/* Fill by increment: sets each level to (index+1) × step (0=step, 1=2×step, 2=3×step, …). */}
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-white px-2 py-2 dark:bg-slate-800/80">
                <span className="min-w-0 flex-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Fill by increment
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  className="w-16 shrink-0 rounded-xl border border-slate-200 px-2 py-2 text-center text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  value={stepFill}
                  onChange={(e) => setStepFill(e.target.value)}
                  placeholder="Step"
                />
                <button
                  type="button"
                  onClick={applyStepFill}
                  className="shrink-0 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  Update
                </button>
              </div>
              <Sortable
                items={form.levels}
                keyFor={(l) => (l as LevelRow)._key}
                onReorder={reorderLevel}
                renderItem={(l, i) => (
                  <div className="flex items-center gap-2">
                    <input
                      className={field + ' flex-1'}
                      value={(l as LevelRow).level_name}
                      onChange={(e) => setLevelName(i, e.target.value)}
                      placeholder="Level name"
                    />
                    <button type="button" aria-label="Decrease point" onClick={() => bumpLevelPoint(i, -LEVEL_STEP)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50">
                      <Minus className="h-4 w-4" />
                    </button>
                    <input type="number" inputMode="decimal"
                      className="w-16 shrink-0 rounded-xl border border-slate-200 px-2 py-2 text-center text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                      value={String((l as LevelRow).point)}
                      onChange={(e) => setLevelPoint(i, e.target.value === '' ? 0 : Number(e.target.value))}
                      placeholder="Point" />
                    <button type="button" aria-label="Increase point" onClick={() => bumpLevelPoint(i, LEVEL_STEP)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50">
                      <Plus className="h-4 w-4" />
                    </button>
                    <button type="button" aria-label="Delete level" onClick={() => removeLevel(i)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-red-500 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-500/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              />
              <button type="button" onClick={addLevel}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800/60">
                <Plus className="h-4 w-4" /> Add level
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
        <BentoTile span="md" tone="tint" accent="slate">
          <div className="text-xs leading-relaxed text-brand-900 dark:text-brand-200">
            <p className="mb-1 flex items-center gap-1.5 font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
              <Info className="h-3.5 w-3.5" /> How points are scored
            </p>
            <p className="mb-1">
              When a todo is completed, the <b>assignee</b> earns the <b>point of the chosen level</b>
              {' '}(your 0…10 scale), then adjusted for timing:
            </p>
            <p className="mb-1 rounded-lg bg-white/70 px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-slate-800/85 dark:text-slate-300">
              assignee = point × (1 − late_days×late% + early_days×early%)
            </p>
            <p className="mb-1">
              The <b>leader</b> earns a share of the assignee's points:
            </p>
            <p className="rounded-lg bg-white/70 px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-slate-800/85 dark:text-slate-300">
              leader = assignee × (leader% − late_days×lead_late% + early_days×lead_early%)
            </p>
          </div>
        </BentoTile>

        {/* Linked tasks tile */}
        {isEdit && (
          <BentoTile span="md" tone="plain">
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
                    className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 transition-colors"
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

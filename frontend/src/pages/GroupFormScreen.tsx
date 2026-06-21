import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Trash2, Check, ListChecks, ChevronRight, Info } from 'lucide-react'
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
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'

const WEIGHTS: { key: keyof ScoringGroupPayload; label: string; group: 'Assignee' | 'Leader' }[] = [
  { key: 'late_penalty', label: 'Late penalty % / day', group: 'Assignee' },
  { key: 'early_bonus', label: 'Early bonus % / day', group: 'Assignee' },
  { key: 'leader_weight', label: 'Leader weight %', group: 'Leader' },
  { key: 'leader_late_penalty', label: 'Leader late penalty % / day', group: 'Leader' },
  { key: 'leader_early_bonus', label: 'Leader early bonus % / day', group: 'Leader' },
]

// Fixed level scale: names are not editable and always run -5 → 5 in order.
// Only the point % per level is configurable. Numbers are the default points.
const LEVEL_DEFS: { name: string; point: number }[] = [
  { name: '-5', point: 0 }, { name: '-4', point: 20 }, { name: '-3', point: 40 },
  { name: '-2', point: 60 }, { name: '-1', point: 80 }, { name: '0', point: 100 },
  { name: '1', point: 125 }, { name: '2', point: 150 }, { name: '3', point: 175 },
  { name: '4', point: 200 }, { name: '5', point: 250 },
]

const defaultLevels = () => LEVEL_DEFS.map((d) => ({ level_name: d.name, point: d.point }))

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

  const [form, setForm] = useState<ScoringGroupPayload>({
    group_name: '',
    description: '',
    late_penalty: 0,
    early_bonus: 0,
    leader_weight: 0,
    leader_late_penalty: 0,
    leader_early_bonus: 0,
    levels: defaultLevels(),
  })

  useEffect(() => {
    if (isEdit && existing) {
      // Keep the fixed -5→5 scale; pull each level's point from the saved group,
      // falling back to the default when a level is missing.
      const pmap = new Map((existing.levels ?? []).map((l: GroupLevel) => [l.level_name, l.point]))
      setForm({
        group_name: existing.group_name,
        description: existing.description ?? '',
        late_penalty: existing.late_penalty ?? 0,
        early_bonus: existing.early_bonus ?? 0,
        leader_weight: existing.leader_weight ?? 0,
        leader_late_penalty: existing.leader_late_penalty ?? 0,
        leader_early_bonus: existing.leader_early_bonus ?? 0,
        levels: LEVEL_DEFS.map((d) => ({
          level_name: d.name,
          point: pmap.has(d.name) ? (pmap.get(d.name) as number) : d.point,
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

  const setLevelPoint = (i: number, point: number) =>
    setForm((f) => ({
      ...f,
      levels: f.levels.map((l, j) => (j === i ? { ...l, point } : l)),
    }))

  const validate = (): string | null => {
    if (!form.group_name.trim()) return 'Group name is required'
    for (const l of form.levels) {
      if (!(typeof l.point === 'number') || isNaN(l.point)) return 'Level points must be numbers'
      if (l.point < 0) return 'Level points cannot be negative'
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
      levels: form.levels.map((l) => ({ level_name: l.level_name.trim(), point: Number(l.point) })),
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
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Group name</label>
          <input
            className={field + (isEdit ? ' bg-slate-100 text-slate-500' : '')}
            value={form.group_name}
            readOnly={isEdit}
            onChange={(e) => setForm((f) => ({ ...f, group_name: e.target.value }))}
            placeholder="e.g. Frontend"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Description</label>
          <textarea
            className={field}
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        {/* How scoring works */}
        <div className="rounded-2xl bg-brand-50 p-3 text-xs leading-relaxed text-brand-900">
          <p className="mb-1 flex items-center gap-1.5 font-bold uppercase tracking-wide text-brand-700">
            <Info className="h-3.5 w-3.5" /> How points are scored
          </p>
          <p className="mb-1">
            When a todo is completed, the <b>assignee</b> earns the <b>point of the chosen level</b>
            {' '}(your −5…5 scale), then adjusted for timing:
          </p>
          <p className="mb-1 rounded-lg bg-white/70 px-2 py-1 font-mono text-[11px] text-slate-700">
            assignee = point × (1 − late_days×late% + early_days×early%)
          </p>
          <p className="mb-1">
            The <b>leader</b> earns a share of the assignee's points:
          </p>
          <p className="rounded-lg bg-white/70 px-2 py-1 font-mono text-[11px] text-slate-700">
            leader = assignee × (leader% − late_days×lead_late% + early_days×lead_early%)
          </p>
        </div>

        {(['Assignee', 'Leader'] as const).map((grp) => (
          <div key={grp} className="rounded-2xl bg-slate-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{grp}</p>
            <div className="flex flex-col gap-2">
              {WEIGHTS.filter((w) => w.group === grp).map((w) => (
                <div key={w.key} className="flex items-center gap-3">
                  <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">{w.label}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="w-14 shrink-0 rounded-xl border border-slate-200 px-1.5 py-2 text-center text-sm focus:border-brand-600 focus:outline-none"
                    value={String(form[w.key] as number)}
                    onChange={(e) => setNum(w.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Levels</p>
          <p className="mb-2 text-[11px] text-slate-400">
            Fixed scale −5 to 5. Only the point per level is editable — this is the points earned.
          </p>
          <div className="mb-1 flex items-center gap-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span className="flex-1">Level</span>
            <span className="w-20 text-center">Point</span>
          </div>
          <div className="flex flex-col gap-2">
            {form.levels.map((l, i) => (
              <div key={l.level_name} className="flex items-center gap-3">
                <span className="flex-1 px-1 text-sm font-semibold text-slate-700">{l.level_name}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  className="w-20 shrink-0 rounded-xl border border-slate-200 px-2 py-2 text-center text-sm focus:border-brand-600 focus:outline-none"
                  value={String(l.point)}
                  onChange={(e) => setLevelPoint(i, e.target.value === '' ? 0 : Number(e.target.value))}
                  placeholder="Point"
                />
              </div>
            ))}
          </div>
        </div>

        {isEdit && (
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
              <ListChecks className="h-3.5 w-3.5" /> Linked tasks
              {linkedTodos && (
                <span className="ml-0.5 rounded-full bg-slate-200 px-1.5 text-[11px] font-bold text-slate-500">
                  {linkedTodos.length}
                </span>
              )}
            </p>
            {todosLoading ? (
              <Spinner className="mx-auto my-2 h-4 w-4 text-slate-400" />
            ) : !linkedTodos || linkedTodos.length === 0 ? (
              <p className="py-2 text-center text-xs text-slate-400">No tasks use this group.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {linkedTodos.map((t) => (
                  <Link
                    key={t.name}
                    to={`/project-item/${encodeURIComponent(t.name)}`}
                    className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{t.to_do || t.name}</p>
                      <p className="truncate text-[11px] text-slate-400">
                        {t.status}
                        {t.deadline ? ` · ${formatDate(t.deadline)}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isEdit ? 'Save changes' : 'Create group'}
        </button>

        {isEdit && (
          <button
            onClick={remove}
            disabled={del.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-card active:bg-rose-50 disabled:opacity-60"
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

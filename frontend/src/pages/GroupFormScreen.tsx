import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, Check } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import {
  useScoringGroup,
  useCreateScoringGroup,
  useUpdateScoringGroup,
  useDeleteScoringGroup,
  useBoot,
  canManageGroups,
} from '@/hooks/useData'
import type { GroupLevel, ScoringGroupPayload } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'

const WEIGHTS: { key: keyof ScoringGroupPayload; label: string; group: 'Assignee' | 'Leader' }[] = [
  { key: 'weight', label: 'Weight %', group: 'Assignee' },
  { key: 'late_penalty', label: 'Late penalty % / day', group: 'Assignee' },
  { key: 'early_bonus', label: 'Early bonus % / day', group: 'Assignee' },
  { key: 'leader_weight', label: 'Leader weight %', group: 'Leader' },
  { key: 'leader_late_penalty', label: 'Leader late penalty % / day', group: 'Leader' },
  { key: 'leader_early_bonus', label: 'Leader early bonus % / day', group: 'Leader' },
]

export default function GroupFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useScoringGroup(name, isEdit)
  const create = useCreateScoringGroup()
  const update = useUpdateScoringGroup()
  const del = useDeleteScoringGroup()

  const [form, setForm] = useState<ScoringGroupPayload>({
    group_name: '',
    description: '',
    weight: 100,
    late_penalty: 0,
    early_bonus: 0,
    leader_weight: 0,
    leader_late_penalty: 0,
    leader_early_bonus: 0,
    levels: [],
  })

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        group_name: existing.group_name,
        description: existing.description ?? '',
        weight: existing.weight ?? 0,
        late_penalty: existing.late_penalty ?? 0,
        early_bonus: existing.early_bonus ?? 0,
        leader_weight: existing.leader_weight ?? 0,
        leader_late_penalty: existing.leader_late_penalty ?? 0,
        leader_early_bonus: existing.leader_early_bonus ?? 0,
        levels: (existing.levels ?? []).map((l: GroupLevel) => ({
          level_name: l.level_name,
          point: l.point,
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

  const setLevel = (i: number, patch: Partial<{ level_name: string; point: number }>) =>
    setForm((f) => ({
      ...f,
      levels: f.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    }))

  const addLevel = () =>
    setForm((f) => ({ ...f, levels: [...f.levels, { level_name: '', point: 0 }] }))

  const removeLevel = (i: number) =>
    setForm((f) => ({ ...f, levels: f.levels.filter((_, j) => j !== i) }))

  const validate = (): string | null => {
    if (!form.group_name.trim()) return 'Group name is required'
    for (const l of form.levels) {
      if (!l.level_name.trim()) return 'Every level needs a name'
      if (!(typeof l.point === 'number') || isNaN(l.point) || l.point < 0)
        return 'Level points must be a number ≥ 0'
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

  const remove = () => {
    if (!confirm('Delete this group?')) return
    del.mutate(name, {
      onSuccess: () => {
        toast('success', 'Group deleted')
        navigate('/groups')
      },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

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

        {(['Assignee', 'Leader'] as const).map((grp) => (
          <div key={grp} className="rounded-2xl bg-slate-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{grp}</p>
            <div className="flex flex-col gap-2">
              {WEIGHTS.filter((w) => w.group === grp).map((w) => (
                <div key={w.key} className="flex items-center gap-2">
                  <label className="flex-1 text-sm text-slate-600">{w.label}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className={field + ' w-24'}
                    value={String(form[w.key] as number)}
                    onChange={(e) => setNum(w.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Levels</p>
            <button
              onClick={addLevel}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" /> Add level
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {form.levels.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={field + ' flex-1'}
                  value={l.level_name}
                  onChange={(e) => setLevel(i, { level_name: e.target.value })}
                  placeholder="Level name"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  className={field + ' w-20'}
                  value={String(l.point)}
                  onChange={(e) => setLevel(i, { point: e.target.value === '' ? 0 : Number(e.target.value) })}
                  placeholder="Point"
                />
                <button
                  onClick={() => removeLevel(i)}
                  className="rounded-lg p-1.5 text-rose-600 active:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {!form.levels.length && (
              <p className="py-2 text-center text-xs text-slate-400">No levels — add at least one to score todos.</p>
            )}
          </div>
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
          <button
            onClick={remove}
            disabled={del.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-card active:bg-rose-50 disabled:opacity-60"
          >
            {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete group
          </button>
        )}
      </div>
    </DetailScreen>
  )
}

import { useEffect } from 'react'
import { SearchableSelect } from './SearchableSelect'
import { useScoringGroups, useScoringGroup } from '@/hooks/useData'
import { computeTodoPoints } from '@/lib/points'

// Group → type → level cascade that drives point scoring, factored out of the
// todo form so meetings (create + edit) reuse the exact same picker. Controlled
// via a single {group, typeName, levelId} value; all reset/recover transitions
// live here so callers just hold the object.
export type GroupLevel = { group: string; typeName: string; levelId: string }
export const emptyGroupLevel: GroupLevel = { group: '', typeName: '', levelId: '' }

const labelCls = 'block text-sm font-medium text-slate-600 dark:text-slate-300'

export function GroupLevelPicker({
  value,
  onChange,
  estimated,
}: {
  value: GroupLevel
  onChange: (v: GroupLevel) => void
  estimated?: number | string
}) {
  const { data: groups } = useScoringGroups()
  const { data: groupDoc } = useScoringGroup(value.group, !!value.group)
  const levels = groupDoc?.levels ?? []
  const types = [...new Set(levels.map((l) => l.type_name))]

  // Editing seeds a levelId with no typeName — recover it once levels load.
  useEffect(() => {
    if (!value.typeName && value.levelId && levels.length) {
      const row = levels.find((l) => l.level_id === value.levelId)
      if (row) onChange({ ...value, typeName: row.type_name })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels])

  const lvl = levels.find((l) => l.level_id === value.levelId)
  const pts = computeTodoPoints(groupDoc?.base_rate_per_minute, Number(estimated || 0), lvl?.difficulty_percent)

  return (
    <div className="flex flex-col gap-3">
      <label className={labelCls}>
        Group (for points)
        <SearchableSelect
          value={value.group}
          onChange={(g) => onChange({ group: g, typeName: '', levelId: '' })}
          options={(groups ?? []).map((g) => ({ value: g.name, label: g.group_name }))}
          placeholder="Select a group…"
          allowClear
        />
      </label>
      <label className={labelCls}>
        Type
        <SearchableSelect
          value={value.typeName}
          onChange={(t) => onChange({ ...value, typeName: t, levelId: '' })}
          options={types.map((t) => ({ value: t, label: t }))}
          placeholder={value.group ? 'Select a type…' : 'Pick a group first…'}
          disabled={!value.group}
        />
      </label>
      <label className={labelCls}>
        Level
        <SearchableSelect
          value={value.levelId}
          onChange={(l) => onChange({ ...value, levelId: l })}
          options={levels
            .filter((l) => l.type_name === value.typeName)
            .map((l) => ({ value: l.level_id!, label: `${l.level_name} (${l.difficulty_percent}%)` }))}
          placeholder={value.typeName ? 'Select a level…' : 'Pick a type first…'}
          disabled={!value.typeName}
        />
      </label>
      {value.group && value.levelId && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Points: <span className="font-medium">{pts}</span>
          {!estimated && ' (set estimated minutes)'}
        </p>
      )}
    </div>
  )
}

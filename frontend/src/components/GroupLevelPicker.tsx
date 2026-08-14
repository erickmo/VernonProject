import { SearchableSelect } from './SearchableSelect'
import { useGroupLevels } from '@/hooks/useData'
import { computeTodoPoints } from '@/lib/points'

// One flat select — "[Group] Type - Level (120%)" — replacing the old
// group→type→level cascade. A single level_id fully identifies group + type +
// level, so callers still hold {group, typeName, levelId} but pick it in one shot.
// Kept the same public API so meeting + todo forms swap in with no call-site change.
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
  const { data: rows } = useGroupLevels()
  const list = rows ?? []
  const sel = list.find((r) => r.level_id === value.levelId)
  const pts = computeTodoPoints(sel?.base_rate, Number(estimated || 0), sel?.difficulty_percent)

  return (
    <div className="flex flex-col gap-3">
      <label className={labelCls}>
        Group / Type / Level (for points)
        <SearchableSelect
          value={value.levelId}
          onChange={(id) => {
            const r = list.find((x) => x.level_id === id)
            onChange(r ? { group: r.group, typeName: r.type_name, levelId: r.level_id } : emptyGroupLevel)
          }}
          options={list.map((r) => ({
            value: r.level_id,
            label: `[${r.group_name}] ${r.type_name} - ${r.level_name} (${r.difficulty_percent}%)`,
          }))}
          placeholder="Search group / type / level…"
          allowClear
        />
      </label>
      {value.levelId && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Points: <span className="font-medium">{pts}</span>
          {!estimated && ' (set estimated minutes)'}
        </p>
      )}
    </div>
  )
}

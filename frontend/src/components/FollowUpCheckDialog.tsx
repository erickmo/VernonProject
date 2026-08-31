import { useEffect, useState, type ReactNode } from 'react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { GroupLevelPicker, type GroupLevel } from '@/components/GroupLevelPicker'
import { useFollowUpCheck } from '@/hooks/useData'
import { todayISO, addDaysISO } from '@/lib/format'

// A check task defaults to Engineering ▸ Backend Development ▸ Testing (100%) at 10 min,
// both editable. Keep in sync with follow_up_check's CHECK_DEFAULT_* server-side.
const DEFAULT_GL: GroupLevel = { group: 'Engineering', typeName: 'Backend Development', levelId: 'eng_be_testing' }
const DEFAULT_EST = '10'

// Quick "hand this to someone else to check" dialog. Shared by /m and /w — a plain
// centered modal (backdrop + Escape close, no native confirm/alert). Picks a checker,
// optionally a note, then spawns a "(Follow Up)" todo for them and marks this one Done.
export function FollowUpCheckDialog({
  open,
  onClose,
  todo,
  team,
  defaultAssignee,
  renderDateField,
}: {
  open: boolean
  onClose: () => void
  todo: { name: string; to_do: string }
  team: { user: string; name: string }[]
  /** Pre-selected checker (the todo's creator). Ignored if not on the team. */
  defaultAssignee?: string
  /** /w injects its shared DatePicker here; /m falls back to native <input type=date>. */
  renderDateField?: (p: { value: string; onChange: (v: string) => void }) => ReactNode
}) {
  const [assignee, setAssignee] = useState('')
  const [note, setNote] = useState('')
  const [estimated, setEstimated] = useState(DEFAULT_EST)
  const [gl, setGl] = useState<GroupLevel>(DEFAULT_GL)
  const [deadline, setDeadline] = useState('')
  const followUp = useFollowUpCheck()

  useEffect(() => {
    if (open) {
      // Default to the creator, but only if they're pickable (on this team).
      setAssignee(team.some((m) => m.user === defaultAssignee) ? defaultAssignee ?? '' : '')
      setNote('')
      setEstimated(DEFAULT_EST)
      setGl(DEFAULT_GL)
      setDeadline(addDaysISO(todayISO(), 1)) // default tomorrow
    }
  }, [open, defaultAssignee, team])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const est = Number(estimated)
  const estValid = Number.isFinite(est) && est >= 5
  const today = todayISO()
  const tomorrow = addDaysISO(today, 1)
  const canSubmit = !!assignee && estValid && !!gl.levelId && !!deadline && !followUp.isPending

  const submit = () => {
    if (!canSubmit) return
    followUp.mutate(
      { todoId: todo.name, assignee, note: note.trim() || undefined, estimated: est, group: gl.group, levelId: gl.levelId, deadline },
      { onSuccess: onClose },
    )
  }

  const field =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Minta rekan cek tugas ini
        </h2>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">“{todo.to_do}”</p>

        <label className="mt-4 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Cek oleh<span className="text-red-500"> *</span>
          <SearchableSelect
            value={assignee}
            onChange={setAssignee}
            options={team.map((m) => ({ value: m.user, label: m.name }))}
            placeholder="Pilih rekan…"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Deadline<span className="text-red-500"> *</span>
          <div className="mt-1 flex gap-1.5">
            {([['Hari ini', today], ['Besok', tomorrow]] as const).map(([lbl, d]) => (
              <button
                key={d}
                type="button"
                onClick={() => setDeadline(d)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  deadline === d
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          {renderDateField ? (
            <div className="mt-1">{renderDateField({ value: deadline, onChange: setDeadline })}</div>
          ) : (
            <input
              type="date"
              className={field}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          )}
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Estimasi (menit)<span className="text-red-500"> *</span>
          <input
            type="number"
            min={5}
            className={field}
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
          />
        </label>

        <div className="mt-3">
          <GroupLevelPicker value={gl} onChange={setGl} estimated={estimated} />
        </div>

        <label className="mt-3 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Catatan (opsional)
          <textarea
            className={field}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Yang perlu dicek…"
          />
        </label>

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Tugas ini ditandai selesai, dan tugas cek dikirim ke rekan yang dipilih.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Batal
          </button>
          <button
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={submit}
            disabled={!canSubmit}
          >
            {followUp.isPending ? 'Mengirim…' : 'Kirim'}
          </button>
        </div>
      </div>
    </div>
  )
}

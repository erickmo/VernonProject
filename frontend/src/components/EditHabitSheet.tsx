import { useEffect, useState } from 'react'
import { X, Check, Pencil } from 'lucide-react'
import { useUpdateHabit } from '@/hooks/useData'
import { WEEKDAY_LABELS, habitDraft, habitDraftError, habitPatch, toggleWeekday } from '@/lib/habitForm'
import type { HabitDraft } from '@/lib/habitForm'
import type { Habit } from '@/lib/types'

// Edit an existing habit — title, emoji, and how often it is scheduled. The quick-add
// on the Habits screen only makes Daily habits, so this is the only way to reach the
// weekday picker api/habit.py::update_habit has always accepted.
export function EditHabitSheet({ open, onClose, habit }: { open: boolean; onClose: () => void; habit: Habit }) {
  const update = useUpdateHabit()
  const [draft, setDraft] = useState<HabitDraft>(() => habitDraft(habit))

  useEffect(() => {
    if (open) setDraft(habitDraft(habit))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit.name])

  if (!open) return null

  const error = habitDraftError(draft)
  const save = () => {
    if (error) return
    const patch = habitPatch(habit, draft)
    if (patch) update.mutate({ habit: habit.name, patch })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-50">
            <Pencil className="h-5 w-5 text-brand-600" /> Ubah kebiasaan
          </h3>
          <button onClick={onClose} aria-label="Tutup" className="rounded-full p-1 text-slate-400 active:scale-95 dark:text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={draft.icon}
            onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
            maxLength={2}
            aria-label="Emoji"
            className="w-14 rounded-xl bg-paper-line py-2 text-center text-lg dark:bg-slate-700"
          />
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            autoFocus
            aria-label="Judul kebiasaan"
            placeholder="Nama kebiasaan"
            className="flex-1 rounded-xl bg-paper-line px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <p className="mb-2 mt-4 text-xs font-semibold text-slate-600 dark:text-slate-300">Jadwal</p>
        <div className="flex gap-2">
          {(['Daily', 'Weekdays'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setDraft({ ...draft, cadence: c })}
              aria-pressed={draft.cadence === c}
              className={
                'flex-1 rounded-xl py-2.5 text-sm font-semibold transition active:scale-95 ' +
                (draft.cadence === c
                  ? 'bg-brand-600 text-white'
                  : 'bg-paper-line text-stone-600 dark:bg-slate-700 dark:text-slate-200')
              }
            >
              {c === 'Daily' ? 'Setiap hari' : 'Hari tertentu'}
            </button>
          ))}
        </div>

        {draft.cadence === 'Weekdays' && (
          <div className="mt-3 flex justify-between gap-1.5">
            {WEEKDAY_LABELS.map((label, day) => {
              const on = draft.weekdays.includes(day)
              return (
                <button
                  key={label}
                  onClick={() => setDraft({ ...draft, weekdays: toggleWeekday(draft.weekdays, day) })}
                  aria-pressed={on}
                  className={
                    'flex-1 rounded-xl py-2 text-xs font-semibold transition active:scale-95 ' +
                    (on ? 'bg-brand-600 text-white' : 'bg-paper-line text-stone-500 dark:bg-slate-700 dark:text-slate-300')
                  }
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {error && <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-600 active:scale-95 dark:bg-slate-700 dark:text-slate-200">
            Batal
          </button>
          <button
            onClick={save}
            disabled={!!error || update.isPending}
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-40"
          >
            <Check className="h-4 w-4" /> Simpan
          </button>
        </div>
      </div>
    </div>
  )
}

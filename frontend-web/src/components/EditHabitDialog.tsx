import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Dialog } from '@web/components/overlays/Dialog'
import { Button } from '@web/components/ui'
import { useUpdateHabit } from '@/hooks/useData'
import { WEEKDAY_LABELS, habitDraft, habitDraftError, habitPatch, toggleWeekday } from '@/lib/habitForm'
import type { HabitDraft } from '@/lib/habitForm'
import type { Habit } from '@/lib/types'

// Edit an existing habit — title, emoji, and how often it is scheduled. The quick-add
// on the Habits page only makes Daily habits, so this is the only way to reach the
// weekday picker api/habit.py::update_habit has always accepted.
export function EditHabitDialog({ open, onClose, habit }: { open: boolean; onClose: () => void; habit: Habit }) {
  const update = useUpdateHabit()
  const [draft, setDraft] = useState<HabitDraft>(() => habitDraft(habit))

  useEffect(() => {
    if (open) setDraft(habitDraft(habit))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit.name])

  const error = habitDraftError(draft)
  const save = () => {
    if (error) return
    const patch = habitPatch(habit, draft)
    if (patch) update.mutate({ habit: habit.name, patch })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ubah kebiasaan"
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button variant="primary" type="submit" disabled={!!error || update.isPending}>Simpan</Button>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <input
          value={draft.icon}
          onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
          maxLength={2}
          aria-label="Emoji"
          className="w-14 rounded-xl border border-line bg-transparent py-2 text-center text-lg focus:border-brand-600 focus:outline-none"
        />
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          autoFocus
          aria-label="Judul kebiasaan"
          placeholder="Nama kebiasaan"
          className="flex-1 rounded-xl border border-line bg-transparent px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none"
        />
      </div>

      <p className="mb-2 mt-4 text-xs font-semibold text-muted">Jadwal</p>
      <div className="flex gap-2">
        {(['Daily', 'Weekdays'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setDraft({ ...draft, cadence: c })}
            aria-pressed={draft.cadence === c}
            className={clsx('flex-1 rounded-xl py-2.5 text-sm font-semibold transition',
              draft.cadence === c ? 'bg-brand-600 text-white' : 'bg-hover/[0.06] text-muted hover:text-ink')}
          >
            {c === 'Daily' ? 'Setiap hari' : 'Hari tertentu'}
          </button>
        ))}
      </div>

      {draft.cadence === 'Weekdays' && (
        <div className="mt-3 flex flex-wrap justify-between gap-1.5">
          {WEEKDAY_LABELS.map((label, day) => {
            const on = draft.weekdays.includes(day)
            return (
              <button
                key={label}
                type="button"
                onClick={() => setDraft({ ...draft, weekdays: toggleWeekday(draft.weekdays, day) })}
                aria-pressed={on}
                className={clsx('min-w-11 flex-1 rounded-xl py-2 text-xs font-semibold transition',
                  on ? 'bg-brand-600 text-white' : 'bg-hover/[0.06] text-muted hover:text-ink')}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {error && <p className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
    </Dialog>
  )
}

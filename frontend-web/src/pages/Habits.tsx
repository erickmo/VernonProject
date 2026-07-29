import { useState } from 'react'
import { Flame, Plus, Check, Trash2, Sparkles } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useConfirm } from '@/components/Confirm'
import { Button } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { useHabits, useToggleHabit, useCreateHabit, useDeleteHabit, useAdoptSuggestion } from '@/hooks/useData'
import type { Habit, HabitWeekDot } from '@/lib/types'

function WeekStrip({ week }: { week: HabitWeekDot[] }) {
  return (
    <div className="flex gap-1.5 mt-2">
      {week.map((d) => (
        <span
          key={d.date}
          title={d.date}
          className={
            'h-2.5 w-2.5 rounded-full ' +
            (d.done ? 'bg-emerald-500' : d.scheduled ? 'bg-line' : 'bg-line/40')
          }
        />
      ))}
    </div>
  )
}

function HabitTile({ h }: { h: Habit }) {
  const toggle = useToggleHabit()
  const del = useDeleteHabit()
  const confirm = useConfirm()
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <button
          onClick={() => toggle.mutate({ habit: h.name })}
          aria-label={h.done_today ? 'Batalkan centang' : 'Tandai selesai'}
          className={
            'h-10 w-10 rounded-full grid place-items-center transition active:scale-90 ' +
            (h.done_today ? 'bg-emerald-500 text-white' : 'bg-hover/[0.06] text-muted')
          }
        >
          {h.done_today ? <Check className="h-5 w-5" /> : <span className="text-lg">{h.icon || '•'}</span>}
        </button>
        <button
          aria-label="Arsipkan"
          onClick={async () => {
            if (await confirm({ title: 'Hapus kebiasaan ini?', confirmLabel: 'Hapus', destructive: true }))
              del.mutate(h.name)
          }}
          className="text-muted hover:text-rose-500 transition active:scale-90"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <p className="font-semibold truncate text-ink">
        {h.icon} {h.title}
      </p>
      <div className="flex items-center gap-1 text-sm text-orange-500">
        <Flame className="h-3.5 w-3.5" /> {h.current_streak} hari
        {h.best_streak > h.current_streak && <span className="text-muted ml-1">· rekor {h.best_streak}</span>}
      </div>
      <WeekStrip week={h.week} />
    </div>
  )
}

export default function Habits() {
  const { data, isLoading } = useHabits()
  const create = useCreateHabit()
  const adopt = useAdoptSuggestion()
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('✅')

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const habits = data?.habits ?? []
  const suggestions = data?.suggestions ?? []

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Kebiasaan</h1>

      <BentoGrid>
        <BentoTile span="full" tone="plain">
          <div className="flex items-center gap-2 max-w-lg">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={2}
              aria-label="Emoji"
              className="w-12 shrink-0 rounded-xl border border-line bg-surface py-2 text-center text-lg text-ink focus:border-brand-500 focus:outline-none"
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kebiasaan baru…"
              className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none"
            />
            <Button
              variant="primary"
              disabled={!title.trim() || create.isPending}
              onClick={() => {
                create.mutate({ title: title.trim(), icon, cadence: 'Daily', weekdays: [] })
                setTitle('')
                setIcon('✅')
              }}
            >
              <Plus className="h-4 w-4" /> Tambah
            </Button>
          </div>
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {habits.length === 0 ? (
            <EmptyState
              icon={Flame}
              title="Belum ada kebiasaan"
              subtitle="Tambahkan satu di atas, atau adopsi saran di bawah."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {habits.map((h) => (
                <HabitTile key={h.name} h={h} />
              ))}
            </div>
          )}
        </BentoTile>

        {suggestions.length > 0 && (
          <BentoTile span="full" tone="tint" accent="brand">
            <p className="flex items-center gap-1.5 font-semibold text-ink">
              <Sparkles className="h-4 w-4" /> Disarankan untukmu{data?.disc_type ? ` (${data.disc_type})` : ''}
            </p>
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suggestions.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3"
                >
                  <span className="text-xl">{s.icon}</span>
                  <span className="flex-1 text-sm text-ink">{s.title}</span>
                  <button
                    onClick={() => adopt.mutate(s.key)}
                    disabled={adopt.isPending}
                    className="shrink-0 text-sm font-semibold text-brand-600 dark:text-brand-400 disabled:opacity-40"
                  >
                    + Tambah
                  </button>
                </div>
              ))}
            </div>
          </BentoTile>
        )}
      </BentoGrid>
    </div>
  )
}

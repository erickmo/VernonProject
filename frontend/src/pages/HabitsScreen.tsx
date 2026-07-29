import { useState } from 'react'
import { Flame, Plus, Check, Trash2, Sparkles } from 'lucide-react'
import { TabScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader } from '@/components/ui'
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
            (d.done
              ? 'bg-emerald-500'
              : d.scheduled
              ? 'bg-paper-edge dark:bg-slate-600'
              : 'bg-paper-line dark:bg-slate-800')
          }
        />
      ))}
    </div>
  )
}

function HabitCard({ h }: { h: Habit }) {
  const toggle = useToggleHabit()
  const del = useDeleteHabit()
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
      <button
        aria-label={h.done_today ? 'Batalkan centang' : 'Tandai selesai'}
        onClick={() => toggle.mutate({ habit: h.name })}
        className={
          'grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-90 ' +
          (h.done_today
            ? 'bg-emerald-500 text-white'
            : 'bg-paper-line text-stone-400 dark:bg-slate-700 dark:text-slate-500')
        }
      >
        {h.done_today ? <Check className="h-[22px] w-[22px]" /> : <span className="text-xl">{h.icon || '•'}</span>}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-semibold text-stone-800 dark:text-slate-50">
            {h.icon} {h.title}
          </p>
          <button
            aria-label="Arsipkan"
            onClick={() => del.mutate(h.name)}
            className="shrink-0 text-stone-300 transition active:scale-90 active:text-rose-500 dark:text-slate-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-sm text-orange-500">
          <Flame className="h-3.5 w-3.5" /> {h.current_streak} hari
          {h.best_streak > h.current_streak && (
            <span className="ml-1 text-stone-400 dark:text-slate-500">· rekor {h.best_streak}</span>
          )}
        </div>
        <WeekStrip week={h.week} />
      </div>
    </div>
  )
}

export default function HabitsScreen() {
  const { data, isLoading, refetch } = useHabits()
  const create = useCreateHabit()
  const adopt = useAdoptSuggestion()
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('✅')

  const habits = data?.habits ?? []
  const suggestions = data?.suggestions ?? []

  return (
    <TabScreen title="Kebiasaan" subtitle={habits.length > 0 ? `${habits.length} kebiasaan` : undefined}>
      {isLoading && !data ? (
        <FullScreenLoader label="Memuat…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          <div className="flex flex-col gap-4 pt-1">
            {habits.length === 0 && (
              <EmptyState
                icon={Flame}
                title="Belum ada kebiasaan"
                subtitle="Tambahkan satu di bawah, atau adopsi saran untukmu."
              />
            )}

            {habits.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {habits.map((h) => (
                  <HabitCard key={h.name} h={h} />
                ))}
              </div>
            )}

            {/* add new — Daily-only quick-add; a full edit sheet with the weekday
                picker is deferred until someone needs custom weekdays on their own habit. */}
            <div className="flex items-center gap-2 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3 shadow-card">
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={2}
                aria-label="Emoji"
                className="w-12 rounded-xl bg-paper-line dark:bg-slate-700 py-2 text-center text-lg"
              />
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Kebiasaan baru…"
                className="flex-1 rounded-xl bg-paper-line dark:bg-slate-700 px-3 py-2 text-sm text-stone-800 dark:text-slate-100 placeholder:text-stone-400 dark:placeholder:text-slate-500"
              />
              <button
                disabled={!title.trim() || create.isPending}
                onClick={() => {
                  create.mutate({ title: title.trim(), icon, cadence: 'Daily', weekdays: [] })
                  setTitle('')
                  setIcon('✅')
                }}
                aria-label="Tambah kebiasaan"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white transition active:scale-90 disabled:opacity-40"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            {suggestions.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-1.5 px-1 text-sm font-bold text-stone-700 dark:text-slate-200">
                  <Sparkles className="h-4 w-4 text-brand-500" /> Disarankan untukmu
                  {data?.disc_type ? ` (${data.disc_type})` : ''}
                </p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center gap-2.5 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper dark:bg-slate-800/60 px-3.5 py-3"
                    >
                      <span className="text-xl">{s.icon}</span>
                      <span className="flex-1 text-sm text-stone-700 dark:text-slate-200">{s.title}</span>
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
              </div>
            )}
          </div>
        </PullToRefresh>
      )}
    </TabScreen>
  )
}

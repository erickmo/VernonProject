import clsx from 'clsx'
import { Zap, Check } from 'lucide-react'
import type { ProjectItem } from '@/lib/types'
import { formatEstimate } from '@/lib/format'

// Per-slot accent so the rail reads as a row of distinct, vibrant cards rather
// than one repeated tile. Cycles if an admin ever sets more than four slots.
const ACCENTS = [
  'from-rose-500 via-red-500 to-orange-500',
  'from-violet-500 via-purple-500 to-fuchsia-500',
  'from-sky-500 via-cyan-500 to-teal-500',
  'from-amber-500 via-orange-500 to-yellow-500',
]

const FINISHED = new Set(['done', 'checked', 'completed'])

/**
 * The day's priority slots as vibrant swipe cards. Occupied slots are gradient
 * cards; unclaimed ones are inert dashed ghosts — only project leaders fill a
 * slot, so there is nothing for the assignee to tap. Renders nothing when the
 * feature is off (slots === 0).
 */
export function PriorityRail({
  slots,
  items,
  onOpen,
  label = 'Prioritas Hari Ini',
}: {
  slots: number
  items: ProjectItem[]
  onOpen: (name: string) => void
  label?: string
}) {
  if (!slots) return null
  const filled = items.slice(0, slots)
  const ghosts = Math.max(0, slots - filled.length)
  const doneCount = filled.filter((t) => FINISHED.has(t.status_key)).length

  return (
    <section className="mt-4" aria-label={label}>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-slate-400">
          <Zap className="h-3.5 w-3.5 text-amber-500" fill="currentColor" /> {label}
        </h2>
        <span className="text-xs font-semibold text-stone-400 dark:text-slate-500">
          {doneCount}/{slots} selesai
        </span>
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filled.map((t, i) => {
          const done = FINISHED.has(t.status_key)
          return (
            <button
              key={t.name}
              onClick={() => onOpen(t.name)}
              className={clsx(
                'relative flex w-44 shrink-0 snap-start flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-3 text-left text-white shadow-card transition active:scale-95',
                ACCENTS[i % ACCENTS.length],
                done && 'opacity-70',
              )}
            >
              <span className="absolute -bottom-4 -right-3 text-6xl font-black leading-none text-white/15">
                {i + 1}
              </span>
              <span className="relative line-clamp-2 text-sm font-bold leading-snug drop-shadow-sm">
                {t.to_do}
              </span>
              <span className="relative mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
                {done && <Check className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{t.project_name}</span>
                {t.estimated > 0 && <span className="shrink-0">· {formatEstimate(t.estimated)}</span>}
              </span>
            </button>
          )
        })}

        {Array.from({ length: ghosts }, (_, i) => (
          <div
            key={`ghost-${i}`}
            className="flex w-44 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-paper-edge py-6 text-stone-400 dark:border-slate-700 dark:text-slate-500"
          >
            <Zap className="h-5 w-5" />
            <span className="text-xs font-semibold">Slot kosong</span>
          </div>
        ))}
      </div>
    </section>
  )
}

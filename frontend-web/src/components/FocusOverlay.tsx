import { useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock,
  Coffee,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { formatClock } from '@/lib/format'
import { ambient, loadSoundPrefs, saveSoundPrefs } from '@/lib/ambientSound'
import type { FocusMeta } from '@/lib/focusUI'

// Distraction-free full-screen countdown. Presentational only — all timer state
// lives in useFocusTimer (caller). X closes overlay but leaves timer running;
// Stop ends it.
export function FocusOverlay({
  title,
  meta,
  displayMs,
  fraction,
  stopwatch,
  paused,
  onPause,
  onResume,
  onReset,
  onStop,
  onClose,
  onOpenTodo,
  advanceLabel,
  onAdvance,
  note,
  onNote,
}: {
  title: string
  meta?: FocusMeta
  displayMs: number // countdown: remaining (negative = overtime). stopwatch: elapsed.
  fraction: number // 1 → full estimate left, 0 → time up
  stopwatch: boolean // no estimate → count up, no overtime
  paused: boolean
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onStop: () => void
  onClose: () => void
  onOpenTodo?: () => void
  advanceLabel?: string // e.g. "Mark Done" / "Approve (Leader)"; undefined → hidden
  onAdvance?: () => void
  note?: string // permanent per-task note (synced across devices)
  onNote?: (v: string) => void
}) {
  const over = !stopwatch && displayMs < 0
  const R = 130
  const C = 2 * Math.PI * R
  // Countdown: ring drains as time passes, pinned empty (red) in overtime.
  // Stopwatch: no target → full static ring.
  const offset = stopwatch ? 0 : over ? C : C * (1 - fraction)

  // ---- ambient sound (coffeeshop) ----
  const [prefs, setPrefs] = useState(() => loadSoundPrefs())
  const { enabled, volume } = prefs

  useEffect(() => {
    if (enabled) ambient.play()
    else ambient.stop()
  }, [enabled])
  useEffect(() => {
    ambient.setVolume(volume)
  }, [volume])
  // Stop sound when leaving focus mode entirely.
  useEffect(() => () => ambient.stop(), [])

  // Escape closes the overlay (timer keeps running, same as the X button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const patch = (p: Partial<typeof prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...p }
      saveSoundPrefs(next)
      return next
    })

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface px-6 dark:bg-slate-950">
      <button
        onClick={onClose}
        aria-label="Close focus mode"
        className="absolute right-4 top-4 rounded-full p-2 text-muted transition hover:text-muted dark:text-slate-500"
      >
        <X className="h-6 w-6" />
      </button>

      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand-500">Focus mode</p>
      <h2 className="line-clamp-2 max-w-xs text-center text-lg font-bold text-ink dark:text-slate-100">
        {title}
      </h2>
      {onOpenTodo && (
        <button
          onClick={onOpenTodo}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 transition hover:text-brand-700 dark:text-brand-400"
        >
          Open task <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Task detail */}
      {meta && (
        <div className="mt-2 mb-7 flex max-w-xs flex-col items-center gap-2">
          {meta.project && (
            <p className="text-xs font-medium text-muted dark:text-slate-500">{meta.project}</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {meta.deadlineHuman && (
              <span
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                  meta.overdue
                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                    : 'bg-canvas text-muted dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                {meta.overdue ? <AlertCircle className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
                {meta.deadlineHuman}
              </span>
            )}
            {meta.estimateLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-muted dark:bg-slate-800 dark:text-slate-300">
                <Clock className="h-3.5 w-3.5" /> {meta.estimateLabel}
              </span>
            )}
            {meta.group && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                <Layers className="h-3.5 w-3.5" /> {meta.group}
              </span>
            )}
          </div>
        </div>
      )}
      {!meta && <div className="mb-8" />}

      <div className="relative flex h-72 w-72 items-center justify-center">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 300 300">
          <circle
            cx="150"
            cy="150"
            r={R}
            fill="none"
            strokeWidth="14"
            className="stroke-slate-100 dark:stroke-slate-800"
          />
          <circle
            cx="150"
            cy="150"
            r={R}
            fill="none"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            className={clsx(
              'transition-[stroke-dashoffset] duration-1000 ease-linear',
              over ? 'stroke-rose-500' : 'stroke-brand-500',
            )}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span
            className={clsx(
              'font-mono text-5xl font-bold tabular-nums',
              over ? 'text-rose-600 dark:text-rose-400' : 'text-ink dark:text-slate-50',
            )}
          >
            {formatClock(displayMs)}
          </span>
          <span
            className={clsx(
              'mt-2 text-xs font-semibold uppercase tracking-wide',
              over
                ? 'text-rose-500'
                : paused
                  ? 'text-amber-500'
                  : 'text-muted dark:text-slate-500',
            )}
          >
            {over ? 'over estimate' : paused ? 'paused' : stopwatch ? 'elapsed' : 'remaining'}
          </span>
        </div>
      </div>

      <div className="mt-10 flex items-center gap-3">
        <button
          onClick={onReset}
          aria-label="Reset timer"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-muted transition hover:bg-hover/[0.04] dark:bg-slate-800 dark:text-slate-300"
        >
          <RotateCcw className="h-6 w-6" />
        </button>

        <button
          onClick={paused ? onResume : onPause}
          aria-label={paused ? 'Resume timer' : 'Pause timer'}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700"
        >
          {paused ? <Play className="ml-1 h-9 w-9" /> : <Pause className="h-9 w-9" />}
        </button>

        <button
          onClick={onStop}
          aria-label="Stop timer"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 transition hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-400"
        >
          <Square className="h-6 w-6" fill="currentColor" />
        </button>
      </div>

      {/* Mark done / approve — one action; label + auth decided server-side. */}
      {advanceLabel && onAdvance && (
        <button
          onClick={onAdvance}
          className="mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {advanceLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      )}

      {/* Permanent per-task note — survives Stop, syncs across devices */}
      {onNote && <NoteField note={note ?? ''} onNote={onNote} />}

      {/* Ambient sound */}
      <div className="mt-10 flex w-full max-w-xs flex-col items-center gap-3">
        <button
          onClick={() => patch({ enabled: !enabled })}
          className={clsx(
            'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
            enabled
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'bg-canvas text-muted dark:bg-slate-800 dark:text-slate-400',
          )}
        >
          {enabled ? <Coffee className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {enabled ? 'Coffeeshop on' : 'Coffeeshop off'}
        </button>

        {enabled && (
          <div className="flex w-full items-center gap-2 px-2">
            <VolumeX className="h-4 w-4 shrink-0 text-muted" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => patch({ volume: Number(e.target.value) })}
              className="h-1.5 flex-1 cursor-pointer accent-brand-600"
            />
            <Volume2 className="h-4 w-4 shrink-0 text-muted" />
          </div>
        )}
      </div>
    </div>
  )
}

// Note textarea: controlled draft that adopts remote (other-device) edits only
// while unfocused, so a live incoming sync never clobbers what you're typing.
function NoteField({ note, onNote }: { note: string; onNote: (v: string) => void }) {
  const [draft, setDraft] = useState(note)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused && note !== draft) setDraft(note)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, focused])
  return (
    <div className="mt-8 w-full max-w-xs">
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Note</label>
      <textarea
        value={draft}
        onChange={(e) => { setDraft(e.target.value); onNote(e.target.value) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={3}
        placeholder="Jot a note for this task — it stays after you stop."
        className="w-full resize-y rounded-2xl border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
      />
    </div>
  )
}

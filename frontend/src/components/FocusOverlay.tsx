import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { useProjectItem } from '@/hooks/useData'
import { useAdvance } from '@/components/AdvanceProvider'
import { useFocusOverlay, closeFocusOverlay } from '@/lib/focusUI'

// Single app-global focus overlay. Mounted once at the app root; shows when a
// timer exists AND the overlay store is open. Presentational only — all timer
// state lives in the shared useFocusTimer store. The X closes the overlay but
// leaves the timer running (the mini-bar stays); Stop ends the timer.
export default function FocusOverlay() {
  const { open, taskId } = useFocusOverlay()
  const { timer, elapsedMs, remainingMs, fraction, hasEstimate, pause, resume, reset, stop, note, setNote } =
    useFocusTimer(taskId ?? '')
  const meta = timer?.meta
  const navigate = useNavigate()
  const advanceConfirm = useAdvance()
  // Current status/auth for the open task; drives the Open/advance actions.
  // enabled: !!name → no fetch while the overlay is closed.
  const { data: todo } = useProjectItem(taskId ?? '')

  // ---- ambient sound (coffeeshop) ---- hooks must run unconditionally, so
  // they sit before the early return. Sound plays only while the overlay is up.
  const [prefs, setPrefs] = useState(() => loadSoundPrefs())
  const { enabled, volume } = prefs
  useEffect(() => {
    if (open && enabled) ambient.play()
    else ambient.stop()
  }, [open, enabled])
  useEffect(() => {
    ambient.setVolume(volume)
  }, [volume])
  useEffect(() => () => ambient.stop(), [])
  const patch = (p: Partial<typeof prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...p }
      saveSoundPrefs(next)
      return next
    })

  if (!open || !timer) return null

  const stopwatch = !hasEstimate
  const paused = timer.status === 'paused'
  const over = !stopwatch && remainingMs < 0
  const displayMs = stopwatch ? elapsedMs : remainingMs

  const R = 130
  const C = 2 * Math.PI * R
  // Countdown: ring drains as time passes, pinned empty (rose) in overtime.
  // Stopwatch: no target, so show a full static ring.
  const offset = stopwatch ? 0 : over ? C : C * (1 - fraction)

  const onStop = () => {
    stop()
    closeFocusOverlay()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-paper via-paper to-brand-50 px-6 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <button
        onClick={closeFocusOverlay}
        aria-label="Close focus mode"
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] rounded-full p-2 text-stone-400 transition active:scale-90 dark:text-slate-500"
      >
        <X className="h-6 w-6" />
      </button>

      <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-brand-500">Focus mode</p>
      <h2 className="line-clamp-2 max-w-xs text-center font-display text-xl font-semibold text-stone-800 dark:text-slate-100">
        {timer.taskTitle}
      </h2>
      <button
        onClick={() => {
          closeFocusOverlay()
          navigate(`/project-item/${encodeURIComponent(timer.taskId)}`)
        }}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 transition active:scale-95 dark:text-brand-400"
      >
        Open task <ArrowUpRight className="h-3.5 w-3.5" />
      </button>

      {/* Task detail */}
      {meta && (
        <div className="mb-7 mt-2 flex max-w-xs flex-col items-center gap-2">
          {meta.project && (
            <p className="text-xs font-medium text-stone-400 dark:text-slate-500">{meta.project}</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {meta.deadlineHuman && (
              <span
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                  meta.overdue
                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                    : 'bg-paper-line text-stone-600 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                {meta.overdue ? <AlertCircle className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
                {meta.deadlineHuman}
              </span>
            )}
            {meta.estimateLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-paper-line px-2.5 py-1 text-xs font-semibold text-stone-600 dark:bg-slate-800 dark:text-slate-300">
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
            className="stroke-paper-edge dark:stroke-slate-800"
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
              over ? 'text-rose-600 dark:text-rose-400' : 'text-stone-900 dark:text-slate-50',
            )}
          >
            {over ? '+' : ''}
            {formatClock(displayMs)}
          </span>
          <span
            className={clsx(
              'mt-2 text-xs font-semibold uppercase tracking-wide',
              over ? 'text-rose-500' : paused ? 'text-amber-500' : 'text-stone-400 dark:text-slate-500',
            )}
          >
            {over ? 'over estimate' : paused ? 'paused' : stopwatch ? 'elapsed' : 'remaining'}
          </span>
        </div>
      </div>

      <div className="mt-10 flex items-center gap-3">
        <button
          onClick={reset}
          aria-label="Reset timer"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-800 dark:text-slate-300"
        >
          <RotateCcw className="h-6 w-6" />
        </button>

        <button
          onClick={paused ? resume : pause}
          aria-label={paused ? 'Resume timer' : 'Pause timer'}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-white shadow-card transition active:scale-90"
        >
          {paused ? <Play className="ml-1 h-9 w-9" /> : <Pause className="h-9 w-9" />}
        </button>

        <button
          onClick={onStop}
          aria-label="Stop timer"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 transition active:scale-90 dark:bg-rose-500/15 dark:text-rose-400"
        >
          <Square className="h-6 w-6" fill="currentColor" />
        </button>
      </div>

      {/* Mark done / approve — label + availability come from the server per
          stage & auth (can_advance). One button covers both transitions. */}
      {todo?.can_advance && todo.next_status_label && (
        <button
          onClick={() =>
            advanceConfirm(timer.taskId, todo.next_status_label!, todo.to_do, () => {
              // Exit fullscreen, but DON'T stop the timer here — advancing to a
              // non-terminal review stage leaves the todo open, so it must stay in
              // focus. AdvanceProvider stops it iff the advance actually completes.
              closeFocusOverlay()
            })
          }
          className="mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-card transition active:scale-95"
        >
          {todo.next_status_label}
          <ArrowRight className="h-4 w-4" />
        </button>
      )}

      {/* Permanent per-task note — survives Stop, syncs across devices */}
      <NoteField note={note} onNote={setNote} />

      {/* Ambient sound */}
      <div className="mt-10 flex w-full max-w-xs flex-col items-center gap-3">
        <button
          onClick={() => patch({ enabled: !enabled })}
          className={clsx(
            'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95',
            enabled
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'bg-paper-line text-stone-500 dark:bg-slate-800 dark:text-slate-400',
          )}
        >
          {enabled ? <Coffee className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {enabled ? 'Coffeeshop on' : 'Coffeeshop off'}
        </button>

        {enabled && (
          <div className="flex w-full items-center gap-2 px-2">
            <VolumeX className="h-4 w-4 shrink-0 text-stone-400" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => patch({ volume: Number(e.target.value) })}
              className="h-1.5 flex-1 cursor-pointer accent-brand-600"
            />
            <Volume2 className="h-4 w-4 shrink-0 text-stone-400" />
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
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
        Note
      </label>
      <textarea
        value={draft}
        onChange={(e) => { setDraft(e.target.value); onNote(e.target.value) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={3}
        placeholder="Jot a note for this task — it stays after you stop."
        className="w-full resize-y rounded-2xl border border-paper-edge bg-paper-card px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
    </div>
  )
}

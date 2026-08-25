import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertTriangle, Clock, ChevronRight, CalendarDays, ArrowRight, Repeat, Play, Timer, Plus, Check, Pause, X, StickyNote, Undo2, ListChecks, Bot, Target, Eye,
} from 'lucide-react'
import { STATUS } from '@/lib/status'
import { formatEstimate, todayISO } from '@/lib/format'
import { Avatar, Pill } from './ui'
import { useAdvance } from '@/components/AdvanceProvider'
import { useReject } from '@/components/RejectProvider'
import { useUndo } from '@/components/UndoProvider'
import { useFocusPill } from '@/hooks/useFocusPill'
import { useSetTodoAllocations, useSetTodoCheck, useSetTodoWorkMode } from '@/hooks/useData'
import { buildNext } from '@/lib/planDay'
import { useTodoContextMenu } from '@/hooks/useTodoMenu'
import type { ProjectItem } from '@/lib/types'

const LONG_MS = 450

interface Props {
  todo: ProjectItem
  // show the assignee avatar (review/team contexts) vs. hide (my own lists)
  showAssignee?: boolean
  showProject?: boolean
  // relative-time string ("2 hours ago") for the Home "Done" tab — not part of
  // ProjectItem itself since only that one list carries it. undefined elsewhere.
  doneAt?: string | null
}

export function TodoCard({ todo, showAssignee, showProject = true, doneAt }: Props) {
  const navigate = useNavigate()
  const advanceConfirm = useAdvance()
  const rejectConfirm = useReject()
  const undoConfirm = useUndo()
  const meta = STATUS[todo.status_key]
  // ponytail: this subscribes the card to the per-second timer tick, so every
  // visible card re-renders ~1×/s while a timer runs. Fine for the Today list's
  // handful of cards; if a screen ever renders hundreds, swap this for an
  // imperative store start that doesn't subscribe.
  const { focus, focusActive, focusMode, onFocusPill } = useFocusPill(todo)
  const menu = useTodoContextMenu()
  const [pressing, setPressing] = useState(false)
  const [flash, setFlash] = useState(false)

  // Desktop-only convenience: while the pointer hovers a card, `c` toggles the
  // assignee's To Check flag and `a` toggles the AI flag — same keys as the
  // open-task shortcuts on /w. Inert on /m (no hover, no keyboard). Same gates as
  // the useTodoMenu items so a card never toggles something its menu wouldn't.
  const setCheckFlag = useSetTodoCheck()
  const setWorkModeFlag = useSetTodoWorkMode()
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    if (!hovered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as (HTMLElement & { tagName?: string }) | null
      if (el && el.tagName && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return
      if (e.key === 'c' && todo.is_mine) {
        e.preventDefault()
        setCheckFlag.mutate({ todoName: todo.name, toCheck: !todo.to_check })
      } else if (e.key === 'a' && (todo.is_mine || todo.can_prioritize)) {
        e.preventDefault()
        setWorkModeFlag.mutate({ todoName: todo.name, workMode: todo.work_mode === 'AI' ? '' : 'AI' })
      } else if (e.key === 'f' && todo.status_key !== 'completed') {
        e.preventDefault()
        onFocusPill()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, todo.name, todo.is_mine, todo.can_prioritize, todo.to_check, todo.work_mode, todo.status_key])

  // A quick bounce whenever the context menu is summoned (long-press on touch,
  // right-click on desktop) so the trigger feels tactile. `pressing` gives live
  // feedback while the finger is held, before the menu opens.
  const triggerMenu = (at: { x: number; y: number }) => {
    if (!menu) return
    setPressing(false)
    setFlash(true)
    setTimeout(() => setFlash(false), 160)
    menu.open(todo, at)
  }

  // Long-press (touch/pen) opens the same context menu as right-click. Mirrors Fab.tsx:
  // arm a timer on down, treat early release / movement as a tap-not-hold and cancel.
  const longFired = useRef(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPt = useRef<{ x: number; y: number } | null>(null)
  const clearTimer = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }
  const cancelPress = () => {
    clearTimer()
    setPressing(false)
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if (!menu || e.pointerType === 'mouse') return
    const pt = { x: e.clientX, y: e.clientY }
    startPt.current = pt
    longFired.current = false
    clearTimer()
    setPressing(true)
    pressTimer.current = setTimeout(() => {
      longFired.current = true
      triggerMenu(pt)
    }, LONG_MS)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startPt.current) return
    if (Math.abs(e.clientX - startPt.current.x) > 10 || Math.abs(e.clientY - startPt.current.y) > 10) cancelPress()
  }

  const onAdvance = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (todo.next_status_label) advanceConfirm(todo.name, todo.next_status_label, todo.to_do)
  }

  const onReject = (e: React.MouseEvent) => {
    e.stopPropagation()
    rejectConfirm(todo.name, todo.to_do)
  }

  const onUndo = (e: React.MouseEvent) => {
    e.stopPropagation()
    undoConfirm(todo.name, todo.to_do)
  }

  const setAlloc = useSetTodoAllocations(todo.name)
  const planned = todo.today_allocation > 0
  const isAI = todo.work_mode === 'AI'
  const onToggleToday = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    if (setAlloc.isPending) return
    const minutes = planned ? 0 : todo.estimated > 0 ? todo.estimated : 30
    setAlloc.mutate(buildNext(todo.allocations ?? [], todayISO(), minutes))
  }

  return (
    <button
      onClick={() => {
        if (longFired.current) { longFired.current = false; return }
        navigate(`/project-item/${encodeURIComponent(todo.name)}`)
      }}
      onContextMenu={(e) => { if (!menu) return; e.preventDefault(); triggerMenu({ x: e.clientX, y: e.clientY }) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerCancel={cancelPress}
      style={{ transform: pressing ? 'scale(0.96)' : flash ? 'scale(1.03)' : undefined }}
      className={clsx(
        'group relative w-full min-w-0 max-w-full overflow-hidden rounded-2xl border-l-4 p-4 text-left shadow-card transition active:scale-[0.99]',
        pressing && 'ring-2 ring-brand-400/70 dark:ring-brand-500/50',
        // Focus no longer owns the background — it's an animated border overlay below,
        // so an AI task keeps its cyan card while focused.
        isAI
          ? 'border-cyan-500 bg-gradient-to-br from-cyan-100 via-white to-violet-100 ring-2 ring-cyan-400/60 shadow-[0_2px_18px_rgba(6,182,212,0.30)] dark:border-cyan-400 dark:from-cyan-500/25 dark:via-slate-800 dark:to-violet-500/25 dark:ring-cyan-400/40'
          : clsx('bg-paper-card dark:bg-slate-800', todo.is_overdue ? 'border-rose-400' : meta.ring),
      )}
    >
      {focusActive && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-20 h-full w-full">
          {/* solid base line — always a full amber outline */}
          <rect
            x="1.25" y="1.25" width="100%" height="100%" rx="14" ry="14"
            fill="none" stroke="currentColor" strokeWidth="2"
            className="text-amber-400/40 dark:text-amber-500/40"
          />
          {/* the light: one short bright segment that travels the perimeter. pathLength
              normalises the outline to 100 units so dash math is size-independent + seamless. */}
          <rect
            x="1.25" y="1.25" width="100%" height="100%" rx="14" ry="14"
            fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            pathLength={100} strokeDasharray="16 84"
            className="tk-runner text-amber-200 [filter:drop-shadow(0_0_4px_#fcd34d)]"
          />
        </svg>
      )}
      {isAI && (
        <Bot
          aria-hidden
          className="pointer-events-none absolute -bottom-4 -right-3 h-28 w-28 rotate-12 text-cyan-500/15 dark:text-cyan-400/15"
        />
      )}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Icon-only status tags — colour distinguishes them; title/aria-label carry the name. */}
          {focusActive && (
            <span title="Fokus" aria-label="Fokus" className="mb-1.5 mr-1.5 inline-flex items-center justify-center rounded-md bg-amber-400 p-1 text-white shadow-sm dark:bg-amber-500">
              <Target className="h-4 w-4" />
            </span>
          )}
          {isAI && (
            <span title="AI Task" aria-label="AI Task" className="mb-1.5 mr-1.5 inline-flex items-center justify-center rounded-md bg-gradient-to-r from-cyan-500 to-violet-500 p-1 text-white shadow-sm">
              <Bot className="h-4 w-4" />
            </span>
          )}
          {todo.to_check && (
            <span title="To Check" aria-label="To Check" className="mb-1.5 mr-1.5 inline-flex items-center justify-center rounded-md bg-rose-500 p-1 text-white shadow-sm dark:bg-rose-500">
              <Eye className="h-4 w-4" />
            </span>
          )}
          {showProject && (
            <p className="mb-1 truncate text-[11px] font-medium uppercase tracking-wide text-stone-400 dark:text-slate-500">
              {todo.is_recurring && (
                <Repeat className="mr-1 inline h-3 w-3 align-[-1px] text-violet-500" aria-label="Recurring" />
              )}
              {todo.brand ? `${todo.brand} · ` : ''}
              {todo.project_name} · {todo.project_detail_title}
            </p>
          )}
          <p className="line-clamp-2 break-words font-semibold leading-snug text-stone-800 dark:text-slate-100">{todo.to_do}</p>

          {todo.notes && (
            <p className="mt-1 flex items-center gap-1 text-xs text-stone-500 dark:text-slate-400">
              <StickyNote className="h-3 w-3 shrink-0 text-amber-500" />
              <span className="truncate">{todo.notes}</span>
            </p>
          )}
          {focus.note && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500 dark:text-slate-400">
              <Timer className="h-3 w-3 shrink-0 text-brand-500" />
              <span className="truncate">{focus.note}</span>
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            {todo.status_key !== 'completed' && (
              <span
                role="button"
                tabIndex={0}
                onClick={onFocusPill}
                title={focusActive ? (focusMode === 'fullscreen' ? 'Open focus timer' : 'Stop focus timer') : 'Start focus timer'}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition active:scale-95',
                  focusActive
                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                    : 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
                )}
              >
                {focusActive ? <Timer className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {focusActive ? 'Focusing' : 'Focus'}
              </span>
            )}
            <Pill className={meta.pill}>
              <span>{meta.emoji}</span>
              {meta.label}
            </Pill>
            {doneAt && (
              <span className="inline-flex items-center gap-1 text-stone-500 dark:text-slate-400">
                <Check className="h-3.5 w-3.5" />
                {doneAt}
              </span>
            )}
            {todo.is_waiting && (
              <Pill className="bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300">
                <Pause className="h-3.5 w-3.5" />
                Waiting
              </Pill>
            )}
            {todo.is_recurring && !showProject && (
              <span className="inline-flex items-center gap-0.5 text-violet-500" title="Recurring">
                <Repeat className="h-3.5 w-3.5" />
              </span>
            )}
            {todo.deadline && (
              <span
                className={clsx(
                  'inline-flex items-center gap-1',
                  todo.is_overdue ? 'font-semibold text-rose-600' : 'text-stone-500 dark:text-slate-400',
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {todo.is_overdue ? `Overdue · ${todo.deadline_human}` : todo.deadline_human}
              </span>
            )}
            {todo.estimated > 0 && (
              <span className="inline-flex items-center gap-1 text-stone-500 dark:text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                {formatEstimate(todo.estimated)}
              </span>
            )}
            {todo.issue_of && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                title="This todo is an issue raised on another todo"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Issue
              </span>
            )}
            {todo.open_issues > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                title={`${todo.open_issues} unresolved issue${todo.open_issues > 1 ? 's' : ''}`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {todo.open_issues}
              </span>
            )}
            {!!todo.checklist?.length && (
              <span className="inline-flex items-center gap-1 text-stone-500 dark:text-slate-400" title="Checklist">
                <ListChecks className="h-3.5 w-3.5" />
                {todo.checklist.filter((i) => i.d).length}/{todo.checklist.length}
              </span>
            )}
            {todo.today_allocation > 0 && showAssignee && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-500/15 px-2 py-0.5 font-semibold text-brand-700 dark:text-brand-300"
                title="Allocated for today"
              >
                <Clock className="h-3.5 w-3.5" />
                {formatEstimate(todo.today_allocation)} today
              </span>
            )}
            {/* ponytail: span role=button inside the card <button> mirrors the existing Focus/advance controls; known HTML5 nesting ceiling — fix when the card is refactored to div+role. */}
            {/* Only the assignee sets the day-plan (backend enforces set_todo_allocations too). */}
            {!showAssignee && todo.is_mine && todo.status_key !== 'completed' && (
              <span
                role="button"
                tabIndex={0}
                onClick={onToggleToday}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleToday(e) } }}
                aria-disabled={setAlloc.isPending}
                title={planned ? 'Remove from today' : 'Add to today'}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition active:scale-95',
                  setAlloc.isPending && 'opacity-50',
                  planned
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-stone-100 text-stone-600 dark:bg-slate-700 dark:text-slate-300',
                )}
              >
                {planned ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {planned ? `${formatEstimate(todo.today_allocation)} today` : 'Today'}
              </span>
            )}
          </div>
        </div>

        {showAssignee ? (
          <Avatar name={todo.assigned_to_name} image={todo.assigned_to_image} config={todo.assigned_to_avatar_config} size={34} />
        ) : (
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-stone-300 dark:text-slate-600" />
        )}
      </div>

      {((todo.can_advance && todo.next_status_label) || todo.can_reject || todo.can_undo) && (
        <div className="mt-3 flex gap-2 border-t border-paper-edge dark:border-slate-800 pt-3">
          {todo.can_reject && (
            <span
              onClick={onReject}
              role="button"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 py-2.5 text-sm font-semibold text-rose-700 dark:text-rose-300 transition active:bg-rose-100 dark:active:bg-rose-500/20"
            >
              <X className="h-4 w-4" />
              Reject
            </span>
          )}
          {todo.can_undo && (
            <span
              onClick={onUndo}
              role="button"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 py-2.5 text-sm font-semibold text-amber-700 dark:text-amber-300 transition active:bg-amber-100 dark:active:bg-amber-500/20"
            >
              <Undo2 className="h-4 w-4" />
              Undo approval
            </span>
          )}
          {todo.can_advance && todo.next_status_label && (
            <span
              onClick={onAdvance}
              role="button"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-50 dark:bg-brand-500/15 py-2.5 text-sm font-semibold text-brand-700 dark:text-brand-300 transition active:bg-brand-100 dark:active:bg-brand-500/20"
            >
              {todo.next_status_label}
              <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
    </button>
  )
}

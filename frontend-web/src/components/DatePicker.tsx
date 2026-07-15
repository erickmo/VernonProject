import { useState, useRef, useLayoutEffect, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/format'
import {
  parseISO, todayParts, todayISO, monthGrid, stepMonth, inRange,
  splitDT, joinDT, monthLabel, WEEKDAYS,
} from '@web/lib/dateGrid'

// Shared, timezone-safe date/datetime pickers. Trigger is a button styled by the
// caller's `className` (pass the same `field`/`inputCls`/`fieldCls` the old
// <input> used); clicking opens a soft-pop month calendar. onChange receives the
// VALUE string, not an event — matches SearchableSelect.

type BaseProps = {
  disabled?: boolean
  className?: string
  id?: string
  min?: string
  max?: string
  placeholder?: string
  'aria-label'?: string
}

const TRIGGER = 'inline-flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:pointer-events-none'
const PANEL_W = 288 // w-72
const PANEL_H = 340 // approx calendar height, for flip-above decision

// Popover panel portaled to <body> and positioned `fixed` at the trigger's rect.
// Portaling escapes the `overflow-hidden`/`overflow-y-auto` dialog, drawer and
// table ancestors that would otherwise clip an in-flow absolute panel — the
// native <input> popup rendered in the top layer and never clipped, so must we.
function AnchoredPanel({
  open, onClose, anchorRef, children,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement>
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const a = anchorRef.current
      if (!a) return
      const r = a.getBoundingClientRect()
      let left = Math.min(r.left, window.innerWidth - PANEL_W - 8)
      left = Math.max(8, left)
      let top = r.bottom + 4
      if (top + PANEL_H > window.innerHeight - 8 && r.top - PANEL_H - 4 > 8) {
        top = r.top - PANEL_H - 4 // flip above when it would overflow the viewport
      }
      setPos({ top, left })
    }
    place()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // Any scroll (capture catches scrolling containers, not just window) detaches
    // the fixed panel from its anchor — close rather than float out of place.
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [open, onClose, anchorRef])

  if (!open || !pos) return null
  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: PANEL_W }}
      className="z-[60] max-h-[80vh] overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-xl"
    >
      {children}
    </div>,
    document.body,
  )
}

// ── Month calendar shown inside the popover ────────────────────────────────
function CalendarPanel({
  selected, onPick, min, max, onClear,
}: {
  selected: string        // 'YYYY-MM-DD' or ''
  onPick: (iso: string) => void
  min?: string
  max?: string
  onClear?: () => void
}) {
  const init = parseISO(selected) ?? todayParts()
  const [view, setView] = useState({ y: init.y, m: init.m })
  const today = todayISO()
  const weeks = monthGrid(view.y, view.m)

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" className="rounded-lg p-1.5 text-muted hover:bg-hover/[0.06]"
          onClick={() => setView((v) => stepMonth(v.y, v.m, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-ink">{monthLabel(view.y, view.m)}</span>
        <button type="button" aria-label="Next month" className="rounded-lg p-1.5 text-muted hover:bg-hover/[0.06]"
          onClick={() => setView((v) => stepMonth(v.y, v.m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="py-1 text-[0.65rem] font-medium uppercase text-muted">{w}</div>
        ))}
        {weeks.flat().map((c) => {
          const ok = inRange(c.iso, min, max)
          const isSel = c.iso === selected
          const isToday = c.iso === today
          return (
            <button
              key={c.iso}
              type="button"
              disabled={!ok}
              onClick={() => onPick(c.iso)}
              className={clsx(
                'aspect-square rounded-lg text-sm transition',
                !c.inMonth && 'text-muted/50',
                c.inMonth && !isSel && 'text-ink',
                ok && !isSel && 'hover:bg-hover/[0.08]',
                !ok && 'cursor-not-allowed opacity-30',
                isSel && 'bg-brand-600 font-semibold text-white',
                isToday && !isSel && 'ring-1 ring-inset ring-brand-500',
              )}
            >
              {c.day}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
        <button type="button" className="rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-hover/[0.06]"
          disabled={!inRange(today, min, max)} onClick={() => onPick(today)}>
          Today
        </button>
        {onClear && (
          <button type="button" className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-hover/[0.06]"
            onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ── Date picker ────────────────────────────────────────────────────────────
export function DatePicker({
  value, onChange, disabled, className, id, min, max, placeholder = 'Select date',
  'aria-label': ariaLabel,
}: BaseProps & { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={ref} type="button" id={id} disabled={disabled} aria-label={ariaLabel}
        aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={clsx(TRIGGER, className)}
      >
        <span className={value ? '' : 'text-muted'}>{value ? formatDate(value) : placeholder}</span>
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted" />
      </button>
      <AnchoredPanel open={open} onClose={() => setOpen(false)} anchorRef={ref}>
        <CalendarPanel
          selected={value} min={min} max={max}
          onPick={(iso) => { onChange(iso); setOpen(false) }}
          onClear={() => { onChange(''); setOpen(false) }}
        />
      </AnchoredPanel>
    </>
  )
}

// ── Date+time picker ───────────────────────────────────────────────────────
// ponytail: native <input type="time"> for the clock part — time inputs don't
// have the cross-browser calendar-rendering inconsistency the date picker fixes.
// Swap to a custom wheel only if consistency there is ever asked for.
export function DateTimePicker({
  value, onChange, disabled, className, id, min, max, placeholder = 'Select date & time',
  'aria-label': ariaLabel,
}: BaseProps & { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const { date, time } = splitDT(value)

  return (
    <>
      <button
        ref={ref} type="button" id={id} disabled={disabled} aria-label={ariaLabel}
        aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={clsx(TRIGGER, className)}
      >
        <span className={date ? '' : 'text-muted'}>
          {date ? `${formatDate(date)}${time ? ` · ${time}` : ''}` : placeholder}
        </span>
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted" />
      </button>
      <AnchoredPanel open={open} onClose={() => setOpen(false)} anchorRef={ref}>
        <CalendarPanel
          selected={date} min={min} max={max}
          onPick={(iso) => onChange(joinDT(iso, time))}
          onClear={() => { onChange(''); setOpen(false) }}
        />
        <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
          <label className="text-xs font-medium text-muted">Time</label>
          <input
            type="time"
            value={time}
            disabled={!date}
            onChange={(e) => onChange(joinDT(date || todayISO(), e.target.value))}
            className="flex-1 rounded-lg border border-line bg-hover/[0.04] px-2 py-1 text-sm text-ink focus:border-brand-600 focus:outline-none disabled:opacity-50"
          />
        </div>
      </AnchoredPanel>
    </>
  )
}

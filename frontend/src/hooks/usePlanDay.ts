import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import { keys } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { todayISO, formatEstimate } from '@/lib/format'
import { autoFillPlan, filterCandidates, sortForPlanning, touchedDiff, buildNext, planFloor } from '@/lib/planDay'
import { usePreviousShiftShortfall } from '@/hooks/useData'
import type { ProjectItem } from '@/lib/types'

// Shared plan-my-day state + save semantics for both the mobile sheet and the
// web drawer. Writes only today's allocation row per touched todo, preserving
// other-day rows (planning only — never touches status/scoring).
export function usePlanDay(candidates: ProjectItem[]) {
  const qc = useQueryClient()
  const toast = useToast()
  const today = todayISO()

  // A today-deadline todo is pinned to today's plan server-side and cannot be
  // removed, so every edit path clamps to its floor rather than offering a zero
  // the server would hand straight back. One clamp in setMin covers the minus
  // button, the preset chips, "Use est." and a typed 0 — they all route here.
  const floors = useMemo(
    () => Object.fromEntries(candidates.map((t) => [t.name, planFloor(t, today)])),
    [candidates, today],
  )
  const [mins, setMins] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      candidates.map((t) => [t.name, Math.max(planFloor(t, today), t.today_allocation || 0)]),
    ),
  )
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  const setMin = (id: string, v: number) =>
    setMins((m) => ({ ...m, [id]: Math.max(floors[id] || 0, Math.round(v)) }))
  const useEstimate = (t: ProjectItem) => setMin(t.name, t.estimated > 0 ? t.estimated : 30)

  const visible = useMemo(
    () => sortForPlanning(filterCandidates(candidates, query), mins),
    [candidates, query, mins],
  )
  const total = Object.values(mins).reduce((s, v) => s + v, 0)

  const save = async () => {
    const touched = touchedDiff(candidates, mins)
    if (!touched.length) return
    setSaving(true)
    try {
      await Promise.all(
        touched.map((t) => mobileApi.setTodoAllocations(t.name, buildNext(t.allocations ?? [], today, mins[t.name] || 0))),
      )
      qc.invalidateQueries({ queryKey: keys.dashboard })
      for (const t of touched) qc.invalidateQueries({ queryKey: keys.projectItem(t.name) })
      toast('success', 'Day planned')
    } catch (e) {
      toast('error', (e as Error).message || 'Could not save plan')
      throw e
    } finally {
      setSaving(false)
    }
  }

  return { mins, setMin, useEstimate, query, setQuery, visible, total, saving, save, floors }
}

// Silent auto-plan. Mounted on both dashboards, so it fires on load AND every
// refetch (after create / edit-deadline / complete) — the "multiple trigger
// points". Runs the SAME logic as the Auto-plan button (autoFillPlan): base =
// every today-deadline task, then top up toward the daily minimum
// (min_daily_estimated_minutes, via the shortfall endpoint) pulling overdue
// (oldest first) then future (nearest first). The only differences from the
// button are: no toast, and seenRef idempotency.
// ponytail: idempotent per todo/day/session via seenRef — honors in-session manual
// removal (a task the user clears from today is not re-added this session), re-plans
// across reloads and at day rollover. Ceiling: a big backlog fires N parallel writes
// on first load (no batch API — add one if it drags).
export function useAutoPlanToday(buckets: {
  due_today?: ProjectItem[]
  overdue?: ProjectItem[]
  upcoming?: ProjectItem[]
}) {
  const qc = useQueryClient()
  const today = todayISO()
  const shortfall = usePreviousShiftShortfall()
  const min = shortfall.data?.today_minimum ?? 0
  const { due_today, overdue, upcoming } = buckets
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    const picks = autoFillPlan(
      { due_today: due_today ?? [], overdue: overdue ?? [], upcoming: upcoming ?? [] },
      min,
    ).filter((p) => !seen.current.has(`${today}:${p.todo.name}`))
    if (!picks.length) return
    for (const p of picks) seen.current.add(`${today}:${p.todo.name}`)
    Promise.all(
      picks.map((p) => mobileApi.setTodoAllocations(p.todo.name, buildNext(p.todo.allocations ?? [], today, p.minutes))),
    )
      .then(() => qc.invalidateQueries({ queryKey: keys.dashboard }))
      .catch(() => {}) // silent — a failed write just retries on the next trigger
  }, [due_today, overdue, upcoming, min, today, qc])
}

// One-click auto-plan: fill today toward the daily-minimum minutes (Vernon
// Settings.min_daily_estimated_minutes, read via the shortfall endpoint). Writes
// est-minutes to today's allocation for the picked tasks; never rewrites tasks
// already planned today. Reversible in the Plan-my-day drawer/sheet.
export function useAutoFillPlan() {
  const qc = useQueryClient()
  const toast = useToast()
  const today = todayISO()
  const shortfall = usePreviousShiftShortfall()
  const [saving, setSaving] = useState(false)

  const run = async (buckets: { due_today: ProjectItem[]; overdue: ProjectItem[]; upcoming: ProjectItem[] }) => {
    const min = shortfall.data?.today_minimum ?? 0
    const picks = autoFillPlan(buckets, min)
    if (!picks.length) {
      toast('success', "You're already at today's target")
      return
    }
    setSaving(true)
    try {
      await Promise.all(
        picks.map((p) => mobileApi.setTodoAllocations(p.todo.name, buildNext(p.todo.allocations ?? [], today, p.minutes))),
      )
      qc.invalidateQueries({ queryKey: keys.dashboard })
      for (const p of picks) qc.invalidateQueries({ queryKey: keys.projectItem(p.todo.name) })
      const added = picks.reduce((s, p) => s + p.minutes, 0)
      toast('success', `Auto-planned ${picks.length} task${picks.length === 1 ? '' : 's'} · ${formatEstimate(added)} added`)
    } catch (e) {
      toast('error', (e as Error).message || 'Could not auto-plan')
    } finally {
      setSaving(false)
    }
  }

  return { run, saving }
}

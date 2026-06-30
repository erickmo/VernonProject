import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import { keys } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { todayISO } from '@/lib/format'
import { filterCandidates, sortForPlanning, touchedDiff, buildNext } from '@/lib/planDay'
import type { ProjectItem } from '@/lib/types'

// Shared plan-my-day state + save semantics for both the mobile sheet and the
// web drawer. Writes only today's allocation row per touched todo, preserving
// other-day rows (planning only — never touches status/scoring).
export function usePlanDay(candidates: ProjectItem[]) {
  const qc = useQueryClient()
  const toast = useToast()
  const today = todayISO()

  const [mins, setMins] = useState<Record<string, number>>(() =>
    Object.fromEntries(candidates.map((t) => [t.name, t.today_allocation || 0])),
  )
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  const setMin = (id: string, v: number) => setMins((m) => ({ ...m, [id]: Math.max(0, Math.round(v)) }))
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

  return { mins, setMin, useEstimate, query, setQuery, visible, total, saving, save }
}

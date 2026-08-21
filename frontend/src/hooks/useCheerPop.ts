import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import { useBoot } from '@/hooks/useData'
import { classifyCheer } from '@/lib/cheer'
import type { CheerKind } from '@/lib/cheer'
import type { AppNotification } from '@/lib/types'

export interface PendingCheer {
  kind: CheerKind
  title: string
  body: string
  from: string
  name: string
  names: string[] // every notification this popup represents — dismiss clears all at once
  todo: string | null // the buzzed Project Todo, for "add to my plan"
  todos: string[] // 'thanks': readable label per cheered todo, stacked one popup per cheerer
}

const noop = () => {}
const H48 = 48 * 60 * 60 * 1000

function parseAt(at: string): number {
  const t = new Date(at.replace(' ', 'T')).getTime()
  return isNaN(t) ? -Infinity : t // NaN → -Infinity, filtered out as too-old
}

function readSeen(key: string): string[] | null {
  // null = key absent / unreadable / not an array → treat as first-ever load
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeSeen(key: string, names: string[]): void {
  try {
    // ponytail: 200-name cap; bump if teams get chattier.
    localStorage.setItem(key, JSON.stringify(names.slice(-200)))
  } catch {
    /* storage unavailable — pops just stop deduping, acceptable */
  }
}

export function useCheerPop(): { cheer: PendingCheer | null; dismiss: () => void } {
  const user = useBoot().data?.user
  const query = useQuery({
    queryKey: ['cheer-feed'],
    queryFn: () => mobileApi.getNotifications(20),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })

  const [seen, setSeen] = useState<Set<string>>(() => new Set())
  const [hydrated, setHydrated] = useState(false)

  const candidates = useMemo<AppNotification[]>(() => {
    const cutoff = Date.now() - H48
    return (query.data?.items ?? [])
      .filter((n) => classifyCheer(n) !== null && n.is_read === false && parseAt(n.at) >= cutoff)
      .sort((a, b) => parseAt(b.at) - parseAt(a.at))
  }, [query.data])

  // Reconcile the seen-set with localStorage once data is in.
  useEffect(() => {
    if (!user) return
    const key = `cheerpop:seen:v1:${user}`
    const stored = readSeen(key)
    if (stored === null) {
      // ponytail: first-ever load on this device — baseline every current
      // candidate as seen so a historical backlog never dumps a wall of pops.
      if (!query.data) return // wait for the first fetch before baselining
      const names = candidates.map((c) => c.name)
      writeSeen(key, names)
      setSeen(new Set(names))
    } else {
      setSeen(new Set(stored))
    }
    setHydrated(true)
  }, [user, candidates, query.data])

  const cheer = useMemo<PendingCheer | null>(() => {
    if (!hydrated) return null
    const hit = candidates.find((c) => !seen.has(c.name))
    if (!hit) return null
    const kind = classifyCheer(hit) as CheerKind
    // 'thanks' (Kudos) stacks per cheerer: fold every unseen cheer from this
    // same actor into one popup instead of popping once per todo they cheered.
    const group =
      kind === 'thanks'
        ? candidates.filter((c) => !seen.has(c.name) && c.actor === hit.actor && classifyCheer(c) === 'thanks')
        : [hit]
    return {
      kind,
      title: hit.title,
      body: hit.body ?? '',
      from: hit.actor_name || hit.actor || '',
      name: hit.name,
      names: group.map((c) => c.name),
      todo: hit.reference_doctype === 'Project Todo' ? hit.reference_name : null,
      todos: group.map((c) => c.subject).filter((s): s is string => !!s),
    }
  }, [hydrated, candidates, seen])

  const dismiss = useCallback(() => {
    if (!user || !cheer) return
    const next = new Set(seen)
    cheer.names.forEach((n) => next.add(n))
    writeSeen(`cheerpop:seen:v1:${user}`, [...next])
    setSeen(next) // re-render surfaces the next candidate immediately
  }, [user, cheer, seen])

  if (!user) return { cheer: null, dismiss: noop }
  return { cheer, dismiss }
}

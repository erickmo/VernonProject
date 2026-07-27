import type { AppNotification } from '@/lib/types'

export type CheerKind = 'thanks' | 'buzz'

// A cheer is a notification a PERSON sent (has an actor). Automated ones
// (scheduled deadline reminders, the "Kenali rekanmu" Kudos nudge) carry no
// actor and are excluded — detection is by actor-presence, never title text.
export function classifyCheer(n: Pick<AppNotification, 'type' | 'actor'>): CheerKind | null {
  if (!n.actor) return null
  if (n.type === 'Deadline') return 'buzz'
  if (n.type === 'Kudos') return 'thanks'
  return null
}

// ponytail: run `npx tsx frontend/src/lib/cheer.ts`-style manual check; not wired into the app.
export function demo(): void {
  if (classifyCheer({ type: 'Deadline', actor: 'a@x' }) !== 'buzz') throw new Error('buzz row failed')
  if (classifyCheer({ type: 'Kudos', actor: 'a@x' }) !== 'thanks') throw new Error('thanks row failed')
  if (classifyCheer({ type: 'Kudos', actor: 'b@x' }) !== 'thanks') throw new Error('cheer row failed')
  if (classifyCheer({ type: 'Deadline', actor: null }) !== null) throw new Error('actorless deadline failed')
  if (classifyCheer({ type: 'Kudos', actor: null }) !== null) throw new Error('actorless kudos failed')
  if (classifyCheer({ type: 'Points', actor: 'a@x' }) !== null) throw new Error('unrelated type failed')
  console.log('cheer demo ok')
}

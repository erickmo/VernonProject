import type { AppNotification } from '@/lib/types'

export type CheerKind = 'thanks' | 'buzz' | 'gift'

// A cheer is a notification a PERSON sent (has an actor). Automated ones
// (scheduled deadline reminders, the "Kenali rekanmu" Kudos nudge) carry no
// actor and are excluded — detection is by actor-presence, never title text.
export function classifyCheer(n: Pick<AppNotification, 'type' | 'actor'>): CheerKind | null {
  if (!n.actor) return null
  if (n.type === 'Deadline') return 'buzz'
  if (n.type === 'Kudos') return 'thanks'
  // Gift has its own type so plain 'Points' (earned todos/meetings) never pops.
  if (n.type === 'Gift') return 'gift'
  return null
}

// ponytail: run `npx tsx frontend/src/lib/cheer.ts`-style manual check; not wired into the app.
export function demo(): void {
  if (classifyCheer({ type: 'Deadline', actor: 'a@x' }) !== 'buzz') throw new Error('buzz row failed')
  if (classifyCheer({ type: 'Kudos', actor: 'a@x' }) !== 'thanks') throw new Error('thanks row failed')
  if (classifyCheer({ type: 'Kudos', actor: 'b@x' }) !== 'thanks') throw new Error('cheer row failed')
  if (classifyCheer({ type: 'Gift', actor: 'a@x' }) !== 'gift') throw new Error('gift row failed')
  if (classifyCheer({ type: 'Gift', actor: null }) !== null) throw new Error('actorless gift failed')
  if (classifyCheer({ type: 'Deadline', actor: null }) !== null) throw new Error('actorless deadline failed')
  if (classifyCheer({ type: 'Kudos', actor: null }) !== null) throw new Error('actorless kudos failed')
  if (classifyCheer({ type: 'Points', actor: 'a@x' }) !== null) throw new Error('earned points must stay quiet')
  console.log('cheer demo ok')
}

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { connectFoodInviteRealtime } from '@/lib/foodInviteRealtime'
import { usePendingFoodInvites } from '@/hooks/useData'
import { FoodInviteModal } from './FoodInviteModal'

// Mounted once per app (both frontends). Realtime `food_invite` → refetch the
// pending list (poll backstop covers a blocked WS). Shows the first unanswered
// invite; closing dismisses it for this session so it can't nag.
export function FoodInviteWatcher() {
  const { data: pending, refetch } = usePendingFoodInvites()
  const location = useLocation()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => connectFoodInviteRealtime(() => { void refetch() }), [refetch])

  // The /food/:name page renders its own modal — don't double up.
  if (location.pathname.startsWith('/food/')) return null
  const invite = (pending ?? []).find((p) => !dismissed.has(p.name))
  if (!invite) return null
  return <FoodInviteModal invite={invite} onDone={() => setDismissed((s) => new Set(s).add(invite.name))} />
}

// Shared points-log presentation: category → icon/chip map + day grouping.
// Used by the private wallet (WalletLog) and the transparent per-user log
// (UserPointsLog) so both render identically.
import type { LucideIcon } from 'lucide-react'
import {
  Wallet, CheckCircle2, Crown, Sparkles, CalendarCheck, Users, Fingerprint,
  GraduationCap, Award, Sun, Heart, MessageSquare, Gift, ShoppingBag, Shirt, Ticket,
} from 'lucide-react'
import { todayISO, parseISO, fmtISO } from '@web/lib/dateGrid'

// category slug (from get_wallet_log / get_user_points_log) -> icon + soft chip.
// Colour is category identity only; the +/- amount carries the money-in/out signal.
export const CATS: Record<string, { icon: LucideIcon; chip: string }> = {
  task:        { icon: CheckCircle2,  chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' },
  leader:      { icon: Crown,         chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  mentor:      { icon: Sparkles,      chip: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
  attended:    { icon: CalendarCheck, chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' },
  meeting:     { icon: Users,         chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' },
  attendance:  { icon: Fingerprint,   chip: 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400' },
  learning:    { icon: GraduationCap, chip: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400' },
  achievement: { icon: Award,         chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  daily:       { icon: Sun,           chip: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400' },
  recognition: { icon: Heart,         chip: 'bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400' },
  feedback:    { icon: MessageSquare, chip: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400' },
  mentoring:   { icon: Sparkles,      chip: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
  reward:      { icon: Gift,          chip: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400' },
  grant:       { icon: Gift,          chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' },
  gift_in:     { icon: Gift,          chip: 'bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400' },
  gift_out:    { icon: Gift,          chip: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400' },
  marketplace: { icon: ShoppingBag,   chip: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400' },
  avatar:      { icon: Shirt,         chip: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
  event:       { icon: Ticket,        chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' },
}
export const CAT_FALLBACK = { icon: Wallet, chip: 'bg-black/[0.04] text-muted dark:bg-white/[0.06]' }

// Human day heading. iso is a YYYY-MM-DD (from the row's Datetime, sliced).
export function dayLabel(iso: string): string {
  const t = parseISO(todayISO())!
  if (iso === todayISO()) return 'Today'
  const y = new Date(t.y, t.m - 1, t.d - 1)
  if (iso === fmtISO(y.getFullYear(), y.getMonth() + 1, y.getDate())) return 'Yesterday'
  const d = parseISO(iso)
  if (!d) return iso
  return new Date(d.y, d.m - 1, d.d).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export type DayGroup<T> = { key: string; label: string; net: number; rows: T[] }

// Bucket an (already newest-first) log by calendar day, preserving order.
export function groupByDay<T extends { date: string | null; amount: number }>(rows: T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  const idx = new Map<string, number>()
  for (const e of rows) {
    const key = e.date ? e.date.slice(0, 10) : ''
    let gi = idx.get(key)
    if (gi === undefined) {
      gi = groups.length
      idx.set(key, gi)
      groups.push({ key, label: key ? dayLabel(key) : 'Earlier', net: 0, rows: [] })
    }
    groups[gi].rows.push(e)
    groups[gi].net += e.amount
  }
  return groups
}

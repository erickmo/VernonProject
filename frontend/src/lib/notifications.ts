import {
  AlarmClock,
  AtSign,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  Coins,
  Gift,
  GraduationCap,
  Hand,
  Heart,
  Megaphone,
  MessageCircle,
  MessageSquareText,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AppNotification, NotificationType } from './types'

export const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  Assignment: ClipboardList,
  Approval: CheckCheck,
  Comment: MessageCircle,
  Mention: AtSign,
  Points: Coins,
  Redemption: Gift,
  Kudos: Hand,
  Feedback: MessageSquareText,
  Deadline: AlarmClock,
  Encouragement: Heart,
  Attendance: CalendarClock,
  Billboard: Megaphone,
  Learning: GraduationCap,
}

/** The destinations whose path differs between /m and /w. */
export interface DeepLinkRoutes {
  /** A leader's "cuti waiting on your input" queue. Advisory since HR became final. */
  exceptionApprovals: string
  /** The requester's own cuti list. Web has no such screen yet — pass '/'. */
  myExceptions: string
  /** HR's inbox — the only screen that can actually decide a cuti. */
  hrExceptions: string
}

/**
 * Where a notification takes you. Keyed on reference_doctype, which every
 * producer sets (see _notify call sites). Anything unmapped lands on home
 * rather than a dead route.
 */
export function deepLink(n: AppNotification, routes: DeepLinkRoutes): string {
  const name = n.reference_name || ''
  const enc = encodeURIComponent(name)
  switch (n.reference_doctype || '') {
    case 'Project Todo':
      return name ? `/project-item/${enc}` : '/'
    case 'Project Detail':
      return name ? `/project-detail/${enc}` : '/'
    case 'Project':
      return name ? `/project/${enc}` : '/'
    case 'Papan Iklan':
      return name ? `/papan-iklan/${enc}` : '/papan-iklan'
    case 'Papan Iklan Ban':
      return '/papan-iklan'
    case 'Course':
      return name ? `/learn/${enc}` : '/learn'
    case 'Company Feedback':
      return '/feedback-inbox'
    case 'Meeting':
      return '/meetings'
    case 'Team Wall':
      return '/team-wall'
    case 'Reward Redemption':
      return '/marketplace'
    // Point grants/gifts and the attendance penalty heads-up both resolve to a
    // ledger row, so both read in the wallet.
    case 'Wallet':
    case 'Daily Attendance':
      return '/wallet'
    case 'Attendance Exception HR':
      return routes.hrExceptions
    case 'Attendance Exception Approval':
      return routes.exceptionApprovals
    case 'Attendance Exception':
      return routes.myExceptions
    default:
      return '/'
  }
}

/**
 * Pseudo-doctypes whose reference_name is not a subject doc. "Wallet" carries the
 * recipient's own email, which is constant across their whole feed — merging on it
 * would fold every grant and gift into one row. deepLink ignores the field for
 * these anyway, so they simply never merge.
 */
const NO_SUBJECT = new Set(['Wallet'])

export interface NotificationGroup {
  key: string
  /** Newest member — supplies the title, body and timestamp shown on the row. */
  head: AppNotification
  /** Every member, so opening the row can mark them all read. */
  names: string[]
  count: number
  unread: boolean
}

/**
 * Collapse repeats about the same subject into one row. Only notifications
 * sharing a type AND a reference doc merge, so three comments on one todo
 * become a single row while two approvals on different todos stay apart.
 * Input is newest-first, so each group's first-seen member is its newest.
 */
export function groupNotifications(items: AppNotification[]): NotificationGroup[] {
  const out: NotificationGroup[] = []
  const byKey = new Map<string, NotificationGroup>()
  for (const n of items) {
    const key =
      n.reference_name && !NO_SUBJECT.has(n.reference_doctype || '')
        ? `${n.type}|${n.reference_doctype}|${n.reference_name}`
        : ''
    const seen = key ? byKey.get(key) : undefined
    if (seen) {
      seen.names.push(n.name)
      seen.count += 1
      seen.unread = seen.unread || !n.is_read
      continue
    }
    // Subject-less notifications (name key) can never collide, so they never merge.
    const group: NotificationGroup = {
      key: key || n.name,
      head: n,
      names: [n.name],
      count: 1,
      unread: !n.is_read,
    }
    out.push(group)
    if (key) byKey.set(key, group)
  }
  return out
}

export interface TypeTab {
  type: NotificationType
  unread: number
}

/** Types present, in the order they first appear (i.e. newest first). */
export function typeTabs(groups: NotificationGroup[]): TypeTab[] {
  const tabs: TypeTab[] = []
  const byType = new Map<NotificationType, TypeTab>()
  for (const g of groups) {
    let tab = byType.get(g.head.type)
    if (!tab) {
      tab = { type: g.head.type, unread: 0 }
      byType.set(g.head.type, tab)
      tabs.push(tab)
    }
    if (g.unread) tab.unread += 1
  }
  return tabs
}

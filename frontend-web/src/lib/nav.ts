import {
  Home, CalendarDays, FolderKanban, CheckCircle2, Video, StickyNote, MessageSquarePlus,
  Trophy, UsersRound, ShoppingBag, Wallet, Gift,
  Users as UsersIcon, Inbox, Layers, ShieldAlert, Settings as SettingsIcon, Tag,
  Zap, Store, Coins, QrCode, Monitor, UserCheck, Ticket, ArrowLeftRight, CalendarCog,
  CalendarClock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  canManageGroups, canManageBrands, canManageUsers, canManageBadges,
  canManageMarketplace, canGrantPoints, canManageAttendance,
} from '@/hooks/useData'

export type NavLeaf = { to: string; label: string; sub: string; icon: LucideIcon; end?: boolean; badge?: 'review'; match?: string }
export type NavGroup = { id: string; label: string; to?: string; leaves: NavLeaf[] }

const WORK: NavLeaf[] = [
  { to: '/', label: 'Today', sub: "Today's work & progress", icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', sub: 'Month & deadlines', icon: CalendarDays },
  { to: '/projects', label: 'Projects', sub: 'All projects & details', icon: FolderKanban, match: '/project' },
  { to: '/review', label: 'Review', sub: 'Approve completed work', icon: CheckCircle2, badge: 'review' },
  { to: '/meetings', label: 'Meetings', sub: 'Schedule & notes', icon: Video },
  { to: '/notes', label: 'Notes', sub: 'Personal docs', icon: StickyNote },
  { to: '/feedback', label: 'Send feedback', sub: 'Tell us anything', icon: MessageSquarePlus },
  { to: '/bookings', label: 'Bookings', sub: 'Rooms & equipment', icon: CalendarClock },
]

const REWARDS: NavLeaf[] = [
  { to: '/events', label: 'Events', sub: 'Browse & register', icon: CalendarDays },
  { to: '/events/manage', label: 'Manage Events', sub: 'Create & roster', icon: CalendarCog, match: '/events/manage' },
  { to: '/my-registrations', label: 'My Registrations', sub: 'Your events', icon: Ticket },
  { to: '/leaderboard', label: 'Leaderboard', sub: 'Rankings & dimensions', icon: Trophy },
  { to: '/team-wall', label: 'Team Wall', sub: 'Recognition feed', icon: UsersRound },
  { to: '/marketplace', label: 'Marketplace', sub: 'Redeem rewards', icon: ShoppingBag },
  { to: '/wallet', label: 'Wallet', sub: 'Points balance & log', icon: Wallet },
  { to: '/gift-points', label: 'Gift Points', sub: 'Send points to peers', icon: Gift },
]

export function buildNavGroups(b: Parameters<typeof canManageUsers>[0]): NavGroup[] {
  const groups: NavGroup[] = [
    { id: 'work', label: 'Work', leaves: WORK },
    { id: 'rewards', label: 'Rewards', leaves: REWARDS },
    { id: 'reports', label: 'Reports', to: '/reports', leaves: [] },
  ]

  // Admin group — nav.ts is the single source of truth; gated per capability
  const admin: NavLeaf[] = [
    ...(canManageUsers(b) ? [{ to: '/users', label: 'Users', sub: 'People & roles', icon: UsersIcon } as NavLeaf] : []),
    ...(canManageUsers(b) ? [{ to: '/feedback-inbox', label: 'Feedback', sub: 'Inbound feedback', icon: Inbox } as NavLeaf] : []),
    ...(canManageUsers(b) ? [{ to: '/transfer-tasks', label: 'Transfer Tasks', sub: 'Reassign a user’s tasks', icon: ArrowLeftRight } as NavLeaf] : []),
    ...(canManageGroups(b) ? [{ to: '/groups', label: 'Groups', sub: 'Work-type taxonomy', icon: Layers } as NavLeaf] : []),
    ...(canManageGroups(b) ? [{ to: '/data-health', label: 'Data Health', sub: 'Integrity checks', icon: ShieldAlert } as NavLeaf] : []),
    ...(canManageGroups(b) ? [{ to: '/settings', label: 'Settings', sub: 'System settings', icon: SettingsIcon } as NavLeaf] : []),
    ...(canManageBrands(b) ? [{ to: '/brands', label: 'Brands', sub: 'Brand registry', icon: Tag } as NavLeaf] : []),
    ...(canManageBadges(b) ? [{ to: '/gamification-settings', label: 'Gamification', sub: 'Badges & tiers', icon: Zap } as NavLeaf] : []),
    ...(canManageMarketplace(b) ? [{ to: '/marketplace-admin', label: 'Marketplace Admin', sub: 'Manage rewards', icon: Store } as NavLeaf] : []),
    ...(canGrantPoints(b) ? [{ to: '/grant-points', label: 'Grant Points', sub: 'Award points', icon: Coins } as NavLeaf] : []),
  ]
  if (admin.length) groups.push({ id: 'admin', label: 'Admin', leaves: admin })

  // attendance — all routes under one canManageAttendance gate
  const att: NavLeaf[] = canManageAttendance(b) ? [
    { to: '/attendance-report', label: 'Attendance', sub: 'Daily report', icon: QrCode },
    { to: '/attendance/schedules', label: 'Schedules', sub: 'Shift schedules', icon: CalendarDays },
    { to: '/attendance/stations', label: 'Stations', sub: 'Scan kiosks', icon: Monitor },
    { to: '/attendance/exceptions', label: 'Leave/WFH', sub: 'Exceptions', icon: Inbox },
    { to: '/attendance/holidays', label: 'Holidays', sub: 'Holiday lists', icon: CalendarDays },
    { to: '/attendance/profiles', label: 'Enrolled', sub: 'Enrolled members', icon: UserCheck },
  ] : []
  if (att.length) groups.push({ id: 'attendance', label: 'Attendance', leaves: att })

  return groups
}

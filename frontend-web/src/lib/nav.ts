import {
  Home, CalendarDays, FolderKanban, CheckCircle2, Video, StickyNote, MessageSquarePlus,
  Trophy, UsersRound, ShoppingBag, Wallet, Gift,
  Users as UsersIcon, Inbox, Layers, ShieldAlert, Settings as SettingsIcon, Tag,
  Zap, QrCode, Monitor, UserCheck, Ticket, ArrowLeftRight,
  CalendarClock, Building2, Megaphone, Ban, BookOpen, BarChart3, User,
  Banknote, Activity as ActivityIcon, Sparkles, CalendarPlus, FileText,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  canManageGroups, canManageBrands, canManageUsers, canManageBadges,
  canManageAttendance, canHrApprove, canManageResources,
  canModerateAds, canManageLms, canManageIncome, canManageCompanies,
} from '@/hooks/useData'

export type NavLeaf = { to: string; label: string; sub: string; icon: LucideIcon; end?: boolean; badge?: 'review'; match?: string }
export type NavGroup = { id: string; label: string; to?: string; leaves: NavLeaf[] }

// Mobile's 5 primary tabs (BottomNav) — pinned at the top of the web sidebar so
// the web's primary flow mirrors the mobile app. Groups below exclude these.
export const NAV_PRIMARY: NavLeaf[] = [
  { to: '/', label: 'Today', sub: '', icon: Home, end: true },
  { to: '/projects', label: 'Projects', sub: '', icon: FolderKanban, match: '/project' },
  { to: '/review', label: 'Review', sub: '', icon: CheckCircle2, badge: 'review' },
  { to: '/reports', label: 'Reports', sub: '', icon: BarChart3, match: '/report' },
  { to: '/me', label: 'Me', sub: '', icon: User, match: '/me' },
]
export const NAV_PRIMARY_PATHS = new Set(NAV_PRIMARY.map((l) => l.to))

const WORK: NavLeaf[] = [
  { to: '/', label: 'Today', sub: "Today's work & progress", icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', sub: 'Month & deadlines', icon: CalendarDays },
  { to: '/projects', label: 'Projects', sub: 'All projects & details', icon: FolderKanban, match: '/project' },
  { to: '/review', label: 'Review', sub: 'Approve completed work', icon: CheckCircle2, badge: 'review' },
  { to: '/meetings', label: 'Meetings', sub: 'Schedule & notes', icon: Video },
  { to: '/notes', label: 'Notes', sub: 'Personal docs', icon: StickyNote },
  { to: '/feedback', label: 'Feedback', sub: 'Send · admins triage', icon: MessageSquarePlus, match: '/feedback' },
  { to: '/bookings', label: 'Bookings', sub: 'Rooms & equipment', icon: CalendarClock },
  { to: '/attendance/my-approvals', label: 'Leave/WFH input', sub: 'Give input as a leader', icon: Inbox },
  { to: '/attendance/request', label: 'Request leave', sub: 'Cuti / WFH', icon: CalendarPlus },
  { to: '/attendance/my-requests', label: 'My leave/WFH', sub: 'Your requests & status', icon: FileText },
  { to: '/learn', label: 'Learn', sub: 'Courses & progress', icon: BookOpen, match: '/learn' },
]

// Social / people-facing surfaces.
const COMMUNITY: NavLeaf[] = [
  { to: '/events', label: 'Events', sub: 'Browse, register & host', icon: CalendarDays, match: '/events' },
  { to: '/my-registrations', label: 'My Registrations', sub: 'Your events', icon: Ticket },
  { to: '/team-wall', label: 'Team Wall', sub: 'Recognition feed', icon: UsersRound },
  { to: '/activity', label: 'Activity', sub: 'Recent team activity', icon: ActivityIcon },
  { to: '/leaderboard', label: 'Leaderboard', sub: 'Rankings & dimensions', icon: Trophy },
  { to: '/income', label: 'Extra Income', sub: 'Opportunities & claims', icon: Banknote },
  { to: '/papan-iklan', label: 'Papan Iklan', sub: 'Jual · beli · sewa', icon: Megaphone },
  { to: '/whats-new', label: "What's New", sub: 'Latest updates', icon: Sparkles },
]

// Everything points-denominated.
const POINTS: NavLeaf[] = [
  { to: '/wallet', label: 'Wallet', sub: 'Points balance & log', icon: Wallet },
  { to: '/gift-points', label: 'Send Points', sub: 'Gift to peers or grant', icon: Gift },
  { to: '/marketplace', label: 'Marketplace', sub: 'Redeem rewards', icon: ShoppingBag },
]

export function buildNavGroups(b: Parameters<typeof canManageUsers>[0]): NavGroup[] {
  const groups: NavGroup[] = [
    { id: 'work', label: 'Work', leaves: WORK },
    { id: 'community', label: 'Community', leaves: COMMUNITY },
    { id: 'points', label: 'Points', leaves: POINTS },
    { id: 'reports', label: 'Reports', to: '/reports', leaves: [
      { to: '/logbook', label: 'Logbook', sub: 'Daily task log', icon: StickyNote },
    ] },
  ]

  // Admin group — nav.ts is the single source of truth; gated per capability
  const admin: NavLeaf[] = [
    ...(canManageUsers(b) ? [{ to: '/users', label: 'Users', sub: 'People & roles', icon: UsersIcon } as NavLeaf] : []),
    ...(canManageUsers(b) ? [{ to: '/feedback-inbox', label: 'Feedback Inbox', sub: 'Read & triage feedback', icon: Inbox } as NavLeaf] : []),
    ...(canManageUsers(b) ? [{ to: '/transfer-tasks', label: 'Transfer Tasks', sub: 'Reassign a user’s tasks', icon: ArrowLeftRight } as NavLeaf] : []),
    ...(canManageGroups(b) ? [{ to: '/groups', label: 'Groups', sub: 'Work-type taxonomy', icon: Layers } as NavLeaf] : []),
    ...(canManageGroups(b) ? [{ to: '/data-health', label: 'Data Health', sub: 'Integrity checks', icon: ShieldAlert } as NavLeaf] : []),
    ...(canManageGroups(b) ? [{ to: '/settings', label: 'Settings', sub: 'System settings', icon: SettingsIcon } as NavLeaf] : []),
    ...(canManageBrands(b) ? [{ to: '/brands', label: 'Brands', sub: 'Brand registry', icon: Tag } as NavLeaf] : []),
    ...(canManageCompanies(b) ? [{ to: '/companies', label: 'Companies', sub: 'Company registry', icon: Building2 } as NavLeaf] : []),
    ...(canManageIncome(b) ? [{ to: '/income-admin', label: 'Manage Extra Income', sub: 'Review claims & opportunities', icon: Banknote } as NavLeaf] : []),
    ...(canManageResources(b) ? [{ to: '/meeting-rooms', label: 'Resources', sub: 'Rooms & equipment', icon: Building2 } as NavLeaf] : []),
    ...(canManageBadges(b) ? [{ to: '/gamification-settings', label: 'Gamification', sub: 'Badges & tiers', icon: Zap } as NavLeaf] : []),
    ...(canManageBadges(b) ? [{ to: '/superpower-admin', label: 'Superpowers', sub: 'Traits & leveling', icon: Sparkles } as NavLeaf] : []),
    ...(canModerateAds(b) ? [{ to: '/papan-iklan/bans', label: 'Iklan Bans', sub: 'Banned posters', icon: Ban } as NavLeaf] : []),
    ...(canManageLms(b) ? [{ to: '/learn-admin', label: 'Manage Learning', sub: 'Author & assign courses', icon: BookOpen } as NavLeaf] : []),
  ]
  if (admin.length) groups.push({ id: 'admin', label: 'Admin', leaves: admin })

  // attendance — admin surfaces under canManageAttendance; the HR cuti inbox is
  // unshifted below under canHrApprove, so HR gets it without the rest.
  const att: NavLeaf[] = canManageAttendance(b) ? [
    { to: '/attendance-report', label: 'Attendance', sub: 'Daily report', icon: QrCode },
    { to: '/attendance/templates', label: 'Shift templates', sub: 'Jam kerja & menit minimum', icon: CalendarDays },
    { to: '/attendance/assignments', label: 'Penugasan shift', sub: 'Tugaskan karyawan ke shift', icon: CalendarDays },
    { to: '/attendance/stations', label: 'Stations', sub: 'Scan kiosks', icon: Monitor },
    { to: '/attendance/holidays', label: 'Holidays', sub: 'Holiday lists', icon: CalendarDays },
    { to: '/attendance/profiles', label: 'Enrolled', sub: 'Enrolled members', icon: UserCheck },
  ] : []
  // HR gets the cuti inbox without the rest of attendance admin.
  if (canHrApprove(b)) {
    att.unshift({ to: '/attendance/leave-types', label: 'Leave Types', sub: 'Kategori & batas cuti', icon: CalendarDays })
    att.unshift({ to: '/attendance/exceptions', label: 'Leave/WFH', sub: 'HR final approval', icon: Inbox })
  }
  if (att.length) groups.push({ id: 'attendance', label: 'Attendance', leaves: att })

  return groups
}

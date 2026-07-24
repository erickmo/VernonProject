import {
  FolderKanban,
  CalendarClock,
  CalendarDays,
  CalendarCheck,
  CalendarOff,
  ClipboardCheck,
  Video,
  QrCode,
  Ticket,
  Trophy,
  Medal,
  Gift,
  Wallet,
  Send,
  Banknote,
  HandHeart,
  StickyNote,
  Smile,
  MessageSquarePlus,
  Megaphone,
  BookOpen,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export type ActionItem = {
  icon: LucideIcon
  title: string // full label — used by the /help "What can I do" list
  short: string // compact label — used by the home quick-action grid tiles
  desc: string
  to: string
  tile?: string // icon-tile color classes, injected per-group into ACTIONS below
}

// Header text + dot accent per group hue. Home grids read this to tint each
// category's section label; full literal strings so Tailwind's purge keeps them.
export const GROUP_ACCENT: Record<string, string> = {
  brand: 'text-brand-600 dark:text-brand-400',
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  rose: 'text-rose-600 dark:text-rose-400',
}

// Single source of truth for "what can I do" — the /help screen renders it
// grouped with descriptions; the home grids render it as tinted category
// sections of tiles. Add an action here and it shows up in both. `tile` = the
// per-category gradient + colored glow for the icon tiles; `hue` keys the
// section header accent (GROUP_ACCENT). Full literal class strings so purge keeps them.
export const ACTION_GROUPS: { title: string; hue: string; tile: string; items: ActionItem[] }[] = [
  {
    title: 'Get work done',
    hue: 'brand',
    tile: 'bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/30',
    items: [
      { icon: FolderKanban, title: 'Projects & todos', short: 'Projects', desc: 'Open a project, add work items and todos.', to: '/projects' },
      { icon: CalendarClock, title: 'Plan your day', short: 'Plan day', desc: "Review today's todos and what's due.", to: '/?plan=1' },
      { icon: QrCode, title: 'Check in with QR', short: 'Check-in', desc: 'Scan the station code to mark attendance.', to: '/scan' },
      { icon: ClipboardCheck, title: 'My attendance', short: 'Attendance', desc: 'Review your attendance record.', to: '/attendance' },
      { icon: CalendarOff, title: 'Request leave', short: 'Cuti', desc: 'Ajukan cuti atau WFH.', to: '/attendance/request' },
      { icon: CalendarDays, title: 'Calendar', short: 'Calendar', desc: 'See deadlines and events on the calendar.', to: '/calendar' },
      { icon: Video, title: 'Meetings', short: 'Meetings', desc: 'Schedule and join meetings.', to: '/meetings' },
      { icon: CalendarCheck, title: 'Resource bookings', short: 'Bookings', desc: 'Book rooms and equipment.', to: '/bookings' },
    ],
  },
  {
    title: 'Events & community',
    hue: 'amber',
    tile: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30',
    items: [
      { icon: Ticket, title: 'Events', short: 'Events', desc: 'Browse and register for office events, or host your own.', to: '/events' },
      { icon: HandHeart, title: 'Recognize teammates', short: 'Recognize', desc: 'React on the team wall to send recognition points.', to: '/team-wall' },
      { icon: Megaphone, title: 'Papan Iklan', short: 'Iklan', desc: 'Pasang iklan — jual, beli, atau sewa barang.', to: '/papan-iklan' },
    ],
  },
  {
    title: 'Rewards & progress',
    hue: 'emerald',
    tile: 'bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-500/30',
    items: [
      { icon: Trophy, title: 'Climb the leaderboard', short: 'Leaderboard', desc: 'See where you rank on productivity and character.', to: '/leaderboard' },
      { icon: Medal, title: 'Earn achievements', short: 'Achievements', desc: 'Unlock badges and warrior tiers as you contribute.', to: '/achievements' },
      { icon: Wallet, title: 'Points wallet', short: 'Wallet', desc: 'Track your balance and full points log.', to: '/wallet' },
      { icon: Gift, title: 'Spend your points', short: 'Rewards', desc: 'Redeem points for rewards in the marketplace.', to: '/marketplace' },
      { icon: Send, title: 'Send points', short: 'Send Pts', desc: 'Gift points from your balance to a teammate.', to: '/gift-points' },
      { icon: Banknote, title: 'Extra income', short: 'Income', desc: 'Claim extra-income opportunities.', to: '/income' },
      { icon: BookOpen, title: 'Learn and develop', short: 'Learn', desc: 'Browse courses and track your progress.', to: '/learn' },
      { icon: Sparkles, title: 'Superpowers', short: 'Superpower', desc: 'Pilih superpowermu dan nilai superpower rekan.', to: '/superpowers' },
    ],
  },
  {
    title: 'Personal',
    hue: 'rose',
    tile: 'bg-gradient-to-br from-rose-400 to-pink-600 text-white shadow-lg shadow-rose-500/30',
    items: [
      { icon: StickyNote, title: 'Capture notes', short: 'Notes', desc: 'Jot quick notes — hold ➕ for an instant one.', to: '/notes' },
      { icon: Smile, title: 'Make it yours', short: 'Avatar', desc: 'Customize your avatar.', to: '/avatar' },
      { icon: MessageSquarePlus, title: 'Send feedback', short: 'Feedback', desc: "Tell the team what's working or missing.", to: '/feedback' },
    ],
  },
]

// Flat list for the quick-action grid — each item carries its group's tile hue.
export const ACTIONS: ActionItem[] = ACTION_GROUPS.flatMap((g) =>
  g.items.map((i) => ({ ...i, tile: g.tile })),
)

// Routes that exist only on the mobile (/m) app — the web surfaces filter these
// out so no tile/card leads to a 404. (/income DOES exist on web, so it is not here.)
export const MOBILE_ONLY = new Set(['/scan', '/attendance'])


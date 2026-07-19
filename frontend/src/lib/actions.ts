import {
  FolderKanban,
  CalendarClock,
  CalendarDays,
  CalendarCheck,
  ClipboardCheck,
  Video,
  QrCode,
  Ticket,
  Trophy,
  Medal,
  Gift,
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

// Single source of truth for "what can I do" — the /help screen renders it
// grouped with descriptions; the home grid flattens it into tiles. Add an
// action here and it shows up in both. `tile` = Gojek-style per-category hue
// for the home tiles; full literal class strings so Tailwind's purge keeps them.
export const ACTION_GROUPS: { title: string; tile: string; items: ActionItem[] }[] = [
  {
    title: 'Get work done',
    tile: 'bg-brand-500 text-white',
    items: [
      { icon: FolderKanban, title: 'Projects & todos', short: 'Projects', desc: 'Open a project, add work items and todos.', to: '/projects' },
      { icon: CalendarClock, title: 'Plan your day', short: 'Plan day', desc: "Review today's todos and what's due.", to: '/?plan=1' },
      { icon: QrCode, title: 'Check in with QR', short: 'Check-in', desc: 'Scan the station code to mark attendance.', to: '/scan' },
      { icon: ClipboardCheck, title: 'My attendance', short: 'Attendance', desc: 'Review your attendance record.', to: '/attendance' },
      { icon: CalendarDays, title: 'Calendar', short: 'Calendar', desc: 'See deadlines and events on the calendar.', to: '/calendar' },
      { icon: Video, title: 'Meetings', short: 'Meetings', desc: 'Schedule and join meetings.', to: '/meetings' },
      { icon: CalendarCheck, title: 'Resource bookings', short: 'Bookings', desc: 'Book rooms and equipment.', to: '/bookings' },
    ],
  },
  {
    title: 'Events & community',
    tile: 'bg-amber-500 text-white',
    items: [
      { icon: Ticket, title: 'Events', short: 'Events', desc: 'Browse and register for office events, or host your own.', to: '/events' },
      { icon: HandHeart, title: 'Recognize teammates', short: 'Recognize', desc: 'React on the team wall to send recognition points.', to: '/team-wall' },
      { icon: Megaphone, title: 'Papan Iklan', short: 'Iklan', desc: 'Pasang iklan — jual, beli, atau sewa barang.', to: '/papan-iklan' },
    ],
  },
  {
    title: 'Rewards & progress',
    tile: 'bg-emerald-500 text-white',
    items: [
      { icon: Trophy, title: 'Climb the leaderboard', short: 'Leaderboard', desc: 'See where you rank on productivity and character.', to: '/leaderboard' },
      { icon: Medal, title: 'Earn achievements', short: 'Achievements', desc: 'Unlock badges and warrior tiers as you contribute.', to: '/achievements' },
      { icon: Gift, title: 'Spend your points', short: 'Rewards', desc: 'Redeem points for rewards in the marketplace.', to: '/marketplace' },
      { icon: Banknote, title: 'Extra income', short: 'Income', desc: 'Claim extra-income opportunities.', to: '/income' },
      { icon: BookOpen, title: 'Learn and develop', short: 'Learn', desc: 'Browse courses and track your progress.', to: '/learn' },
      { icon: Sparkles, title: 'Superpowers', short: 'Kekuatan', desc: 'Pilih kekuatanmu dan nilai kekuatan rekan.', to: '/superpowers' },
    ],
  },
  {
    title: 'Personal',
    tile: 'bg-rose-500 text-white',
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


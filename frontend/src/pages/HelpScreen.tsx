import { useNavigate } from 'react-router-dom'
import {
  Compass,
  FolderKanban,
  CalendarClock,
  QrCode,
  Ticket,
  CalendarCog,
  Trophy,
  Medal,
  Gift,
  HandHeart,
  StickyNote,
  Smile,
  MessageSquarePlus,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { DetailScreen } from '@/components/Layout'

// Onboarding "what can I do" list. Each card jumps to the real screen.
const ITEMS: { icon: LucideIcon; title: string; desc: string; to: string }[] = [
  { icon: FolderKanban, title: 'Projects & todos', desc: 'Open a project, add work items and todos.', to: '/projects' },
  { icon: CalendarClock, title: 'Plan your day', desc: "Review today's todos and what's due.", to: '/' },
  { icon: QrCode, title: 'Check in with QR', desc: 'Scan the station code to mark attendance.', to: '/scan' },
  { icon: Ticket, title: 'Join an event', desc: 'Browse office events and register — free or paid.', to: '/events' },
  { icon: CalendarCog, title: 'Host an event', desc: 'Create events and manage who registered.', to: '/events/manage' },
  { icon: Trophy, title: 'Climb the leaderboard', desc: 'See where you rank on productivity and character.', to: '/leaderboard' },
  { icon: Medal, title: 'Earn achievements', desc: 'Unlock badges and warrior tiers as you contribute.', to: '/achievements' },
  { icon: Gift, title: 'Spend your points', desc: 'Redeem points for rewards in the marketplace.', to: '/marketplace' },
  { icon: HandHeart, title: 'Recognize teammates', desc: 'React on the team wall to send recognition points.', to: '/team-wall' },
  { icon: StickyNote, title: 'Capture notes', desc: 'Jot quick notes — hold ➕ for an instant one.', to: '/notes' },
  { icon: Smile, title: 'Make it yours', desc: 'Customize your avatar.', to: '/avatar' },
  { icon: MessageSquarePlus, title: 'Send feedback', desc: "Tell the team what's working or missing.", to: '/feedback' },
]

export default function HelpScreen() {
  const navigate = useNavigate()
  return (
    <DetailScreen title="What can I do">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 shadow-card">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
            <Compass className="h-5 w-5" />
          </div>
          <p className="text-sm text-stone-500 dark:text-slate-400">
            New to Vernon? Here's everything you can do. Tap any card to jump right in.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {ITEMS.map((it) => (
            <button
              key={it.title}
              onClick={() => navigate(it.to)}
              className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3.5 text-left shadow-card active:scale-[0.99]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                <it.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-stone-700 dark:text-slate-100">{it.title}</p>
                <p className="text-xs text-stone-400 dark:text-slate-500">{it.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-stone-300 dark:text-slate-600" />
            </button>
          ))}
        </div>
      </div>
    </DetailScreen>
  )
}

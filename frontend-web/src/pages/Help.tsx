import { useNavigate } from 'react-router-dom'
import {
  FolderKanban,
  CalendarClock,
  Trophy,
  Medal,
  Gift,
  HandHeart,
  StickyNote,
  Smile,
  MessageSquarePlus,
  Megaphone,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'

// Onboarding "what can I do" list. Each card jumps to the real screen.
// (No QR check-in here — attendance scan is a mobile-only route.)
const ITEMS: { icon: LucideIcon; title: string; desc: string; to: string }[] = [
  { icon: FolderKanban, title: 'Projects & todos', desc: 'Open a project, add work items and todos.', to: '/projects' },
  { icon: CalendarClock, title: 'Plan your day', desc: "Review today's todos and what's due.", to: '/' },
  { icon: Trophy, title: 'Climb the leaderboard', desc: 'See where you rank on productivity and character.', to: '/leaderboard' },
  { icon: Medal, title: 'Earn achievements', desc: 'Unlock badges and warrior tiers as you contribute.', to: '/achievements' },
  { icon: Gift, title: 'Spend your points', desc: 'Redeem points for rewards in the marketplace.', to: '/marketplace' },
  { icon: HandHeart, title: 'Recognize teammates', desc: 'React on the team wall to send recognition points.', to: '/team-wall' },
  { icon: StickyNote, title: 'Capture notes', desc: 'Jot quick notes and keep track of ideas.', to: '/notes' },
  { icon: Smile, title: 'Make it yours', desc: 'Customize your avatar.', to: '/avatar' },
  { icon: MessageSquarePlus, title: 'Send feedback', desc: "Tell the team what's working or missing.", to: '/feedback' },
  { icon: Megaphone, title: 'Papan Iklan', desc: 'Pasang iklan — jual, beli, atau sewa barang.', to: '/papan-iklan' },
]

export default function Help() {
  const nav = useNavigate()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">What can I do</h1>
        <p className="mt-1 text-sm text-muted">
          New to Vernon? Here's everything you can do — click any card to jump in.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((it) => (
          <button
            key={it.title}
            onClick={() => nav(it.to)}
            className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:bg-hover/[0.04]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
              <it.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{it.title}</p>
              <p className="mt-0.5 text-xs text-muted">{it.desc}</p>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  )
}

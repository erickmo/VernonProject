import { BookOpen, Cross, MoonStar, Flame, Flower2, type LucideIcon } from 'lucide-react'

// Per-religion look for the daily-verse card. Colours are inline hex (not Tailwind
// classes) on purpose: the card renders on BOTH frontends and a dynamic Tailwind
// class here wouldn't survive each app's content-scan/purge. Icon + gradient carry
// the religious identity — a cross for Christians, crescent-star for Islam, etc.
export type VerseTheme = {
  colors: [string, string, string] // gradient stops (top-left → bottom-right)
  glow: string // rgba for the drop shadow
  Icon: LucideIcon
}

const CHRISTIAN: VerseTheme = {
  colors: ['#6366f1', '#7c3aed', '#7e22ce'], // liturgical indigo→violet→purple
  glow: 'rgba(124,58,237,0.55)',
  Icon: Cross,
}

const THEMES: Record<string, VerseTheme> = {
  Kristen: CHRISTIAN,
  Katolik: CHRISTIAN,
  Islam: { colors: ['#10b981', '#16a34a', '#0f766e'], glow: 'rgba(16,185,129,0.5)', Icon: MoonStar }, // green
  Hindu: { colors: ['#f97316', '#d97706', '#e11d48'], glow: 'rgba(249,115,22,0.55)', Icon: Flame }, // saffron
  Buddha: { colors: ['#f59e0b', '#ca8a04', '#ea580c'], glow: 'rgba(245,158,11,0.55)', Icon: Flower2 }, // gold/lotus
}

// Unknown / no religion → the warm generic look.
const FALLBACK: VerseTheme = { colors: ['#fbbf24', '#f97316', '#f43f5e'], glow: 'rgba(249,115,22,0.55)', Icon: BookOpen }

export const verseTheme = (religion?: string | null): VerseTheme => (religion && THEMES[religion]) || FALLBACK

// Ready-made inline style for the card root.
export const verseCardStyle = (t: VerseTheme): React.CSSProperties => ({
  backgroundImage: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]}, ${t.colors[2]})`,
  boxShadow: `0 14px 36px -12px ${t.glow}`,
})

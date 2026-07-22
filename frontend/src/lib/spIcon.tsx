import type { ComponentType, CSSProperties } from 'react'
import clsx from 'clsx'
import {
  Telescope, Puzzle, TrendingUp, Megaphone, Target, Handshake, Crown, MessageCircle,
  CheckCircle, Sparkles, BarChart3, Users, Shuffle, HeartHandshake, DollarSign,
  Lightbulb, Settings, BookOpen, UsersRound, Scale,
  Heart, PartyPopper, ShieldCheck, Compass, Hourglass, Wind, BatteryCharging, Gift, Sprout,
  HandHelping, Ear, Search, Rocket, Microscope,
  Clock, Zap, Flame, Flag, Leaf, Star,
} from 'lucide-react'

// Single source of truth for superpower / level icons, shared by /m and /w.
// Seeded catalog `icon` values are kebab-case lucide names → real vector icons.
// Levels still use emoji glyphs; unknown/emoji values fall back to raw text so
// nothing ever crashes. Curated map keeps lucide tree-shakeable (no full barrel).
const LUCIDE: Record<string, ComponentType<{ className?: string; style?: CSSProperties }>> = {
  // hard-skill catalog
  telescope: Telescope, puzzle: Puzzle, 'trending-up': TrendingUp, megaphone: Megaphone,
  target: Target, handshake: Handshake, crown: Crown, 'message-circle': MessageCircle,
  'check-circle': CheckCircle, sparkles: Sparkles, 'bar-chart-3': BarChart3, users: Users,
  shuffle: Shuffle, 'heart-handshake': HeartHandshake, 'dollar-sign': DollarSign,
  lightbulb: Lightbulb, settings: Settings, 'book-open': BookOpen, 'users-round': UsersRound,
  scale: Scale,
  // character / human traits
  heart: Heart, 'party-popper': PartyPopper, 'shield-check': ShieldCheck, compass: Compass,
  hourglass: Hourglass, wind: Wind, 'battery-charging': BatteryCharging, gift: Gift, sprout: Sprout,
  'hand-helping': HandHelping, ear: Ear, search: Search, rocket: Rocket, microscope: Microscope,
  // performance-earned
  clock: Clock, zap: Zap, flame: Flame, flag: Flag,
  // misc / level fallbacks
  leaf: Leaf, star: Star,
}

// Known lucide name → component; else the raw string (emoji), else a star.
export function SPIcon({ icon, className, color }: { icon?: string; className?: string; color?: string }) {
  const Cmp = LUCIDE[(icon || '').trim().toLowerCase()]
  const style = color ? { color } : undefined
  if (Cmp) return <Cmp className={className} style={style} />
  return <span className={clsx('leading-none', className)} style={style}>{icon || '⭐'}</span>
}

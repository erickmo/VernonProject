import {
  Car, CarFront, Truck, Siren, Bike, Rocket, Crosshair, Axe, Swords, Dog, Cat,
  Bird, Fish, Trophy, Medal, Coins, Gem, Rainbow, Sword, Shield, Target, Flame, Sparkles,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  Car, CarFront, Truck, Siren, Bike, Rocket, Crosshair, Axe, Swords, Dog, Cat,
  Bird, Fish, Trophy, Medal, Coins, Gem, Rainbow, Sword, Shield, Target, Flame, Sparkles,
}

export function CollectibleIcon({ name, className }: { name?: string | null; className?: string }) {
  const Cmp = (name && ICONS[name]) || Gem
  return <Cmp className={className} />
}

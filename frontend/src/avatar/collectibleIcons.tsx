import {
  // vehicles
  Car, CarFront, Truck, Siren, Bike, Rocket, Bus, Ship, Sailboat, Ambulance, Fuel, Plane,
  // weapons/tools
  Crosshair, Axe, Swords, Sword, Anchor, Bomb, Target,
  // animals
  Dog, Cat, Bird, Fish, Rabbit, Turtle, Squirrel, Snail, Bug, PawPrint,
  // trophies/collectibles
  Trophy, Medal, Coins, Gem, Diamond, Award, BadgeCheck,
  // nature
  Rainbow, Flame, Sparkles, Moon, Cloud, Snowflake, Feather, Leaf, Flower, Sprout,
  TreePine, TreeDeciduous, Mountain, MountainSnow, Sunrise, Sunset, Waves, Droplets, Wind,
  // badges/symbols
  Shield, ShieldCheck, Heart, Star, Crown, Zap, Sun, Wand2, GraduationCap, HardHat,
  Skull, Ghost, Eye, Key, Lock, Bookmark, Tag, Flag, ThumbsUp, Smile, Compass, Bell,
  // tech/objects
  Lightbulb, Music, Brain, Atom, Bot, Cpu, Battery, Camera, Film, Palette, Book, Globe,
  Tent, Glasses, Watch, Backpack, Wallet, PiggyBank, Banknote, DollarSign, Gift,
  Gamepad2, Joystick, Dices, Puzzle, Umbrella,
  // food/drink
  Cake, Coffee, Pizza, IceCream, Cookie, Apple, Beer, Wine, Soup, Beef, Banana,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  Car, CarFront, Truck, Siren, Bike, Rocket, Bus, Ship, Sailboat, Ambulance, Fuel, Plane,
  Crosshair, Axe, Swords, Sword, Anchor, Bomb, Target,
  Dog, Cat, Bird, Fish, Rabbit, Turtle, Squirrel, Snail, Bug, PawPrint,
  Trophy, Medal, Coins, Gem, Diamond, Award, BadgeCheck,
  Rainbow, Flame, Sparkles, Moon, Cloud, Snowflake, Feather, Leaf, Flower, Sprout,
  TreePine, TreeDeciduous, Mountain, MountainSnow, Sunrise, Sunset, Waves, Droplets, Wind,
  Shield, ShieldCheck, Heart, Star, Crown, Zap, Sun, Wand2, GraduationCap, HardHat,
  Skull, Ghost, Eye, Key, Lock, Bookmark, Tag, Flag, ThumbsUp, Smile, Compass, Bell,
  Lightbulb, Music, Brain, Atom, Bot, Cpu, Battery, Camera, Film, Palette, Book, Globe,
  Tent, Glasses, Watch, Backpack, Wallet, PiggyBank, Banknote, DollarSign, Gift,
  Gamepad2, Joystick, Dices, Puzzle, Umbrella,
  Cake, Coffee, Pizza, IceCream, Cookie, Apple, Beer, Wine, Soup, Beef, Banana,
}

export function CollectibleIcon({ name, className }: { name?: string | null; className?: string }) {
  const Cmp = (name && ICONS[name]) || Gem
  return <Cmp className={className} />
}

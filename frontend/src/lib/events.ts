import type { EventItem } from './types'

// Keep in sync with the Vernon Event `category` Select options (backend).
export const EVENT_CATEGORIES = ['Workshop', 'Seminar', 'Expo', 'Kelas', 'Sosial', 'Kompetisi', 'Lainnya']

export type EventFilter = {
  q: string
  period: 'upcoming' | 'past'
  category: string // 'all' or a category value
  pricing: string // 'all' | 'Free' | 'Points' | 'Rupiah'
}

export const isUpcoming = (e: EventItem) => new Date(e.start_datetime).getTime() >= Date.now()

export function filterEvents(items: EventItem[], f: EventFilter): EventItem[] {
  const q = f.q.trim().toLowerCase()
  return items.filter(
    (e) =>
      (f.period === 'upcoming' ? isUpcoming(e) : !isUpcoming(e)) &&
      (f.category === 'all' || e.category === f.category) &&
      (f.pricing === 'all' || e.pricing === f.pricing) &&
      (!q || e.title.toLowerCase().includes(q)),
  )
}

// Hero source: featured AND still upcoming.
export const featuredUpcoming = (items: EventItem[]) => items.filter((e) => e.is_featured && isUpcoming(e))

// Distinct categories actually present in the data (for the chip row).
export const eventCategories = (items: EventItem[]) =>
  [...new Set(items.map((e) => e.category).filter(Boolean))] as string[]

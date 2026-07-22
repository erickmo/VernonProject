// VernonCorp values — reminded on login (all three) and the dashboard (one/day).
// Shared so the two frontends never drift on the wording.
export const VERNON_VALUES = [
  'In the business of making people happy',
  'Empathy',
  "Doing what's right, not what's nice",
] as const

// Everyone the work is meant to make happy — shown on the login hero.
export const VERNON_STAKEHOLDERS = [
  'God', 'Customers', 'Teams', 'Shareholders', 'Partners', 'Suppliers', 'Society',
] as const

// Deterministic value-of-the-day: rotates daily, stable across a day's renders.
export function valueOfDay(now: Date = new Date()): string {
  const day = Math.floor(now.getTime() / 86_400_000)
  return VERNON_VALUES[day % VERNON_VALUES.length]
}

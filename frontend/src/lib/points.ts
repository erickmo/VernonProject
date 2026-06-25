// point = base_rate_per_minute × estimated_minutes × (difficulty_percent / 100)
export function computeTodoPoints(
  baseRatePerMinute: number | null | undefined,
  estimatedMinutes: number | null | undefined,
  difficultyPercent: number | null | undefined,
): number {
  const base = Number(baseRatePerMinute) || 0
  const minutes = Number(estimatedMinutes) || 0
  const pct = Number(difficultyPercent) || 0
  return Math.round(base * minutes * (pct / 100) * 10000) / 10000
}

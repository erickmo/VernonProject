export function matchCommand(label: string, group: string, query: string): boolean {
  const s = query.trim().toLowerCase()
  if (!s) return true
  return label.toLowerCase().includes(s) || group.toLowerCase().includes(s)
}

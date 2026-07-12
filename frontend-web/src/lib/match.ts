// `haystack` is optional so nav/people commands (no haystack) keep matching
// label OR group exactly as before; a todo command can pass a richer haystack
// (built from matchProjectItem's fields) to match deeper than label+group.
export function matchCommand(label: string, group: string, query: string, haystack?: string): boolean {
  const s = query.trim().toLowerCase()
  if (!s) return true
  if (haystack !== undefined) return haystack.toLowerCase().includes(s)
  return label.toLowerCase().includes(s) || group.toLowerCase().includes(s)
}

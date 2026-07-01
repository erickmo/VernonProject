// React Router already URL-decodes path params once. A second decodeURIComponent
// throws on a bare '%' — e.g. a reward literally named "20% off" — which
// white-screens the page. safeDecode falls back to the raw value instead of
// crashing; for normal (already-decoded) names it's a harmless no-op.
export function safeDecode(v = ''): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

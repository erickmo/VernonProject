/** What the navbar dot can say. `unknown` covers both "haven't heard yet" (first
 *  paint) and "the check itself failed" — from the reader's point of view those are
 *  the same thing: we cannot vouch for the connector either way. Keeping it separate
 *  from `down` matters, because `down` is a claim ABOUT the server and `unknown` is
 *  an admission about us. */
export type McpState = 'up' | 'down' | 'unknown'

export type McpStatusPayload = {
  status: McpState
  checked_at: string | null
  latency_ms: number | null
  /** Populated only for a System Manager — the server decides, not the UI. */
  detail?: {
    target?: string | null
    http_status?: number | null
    error?: string | null
    timeout_seconds?: number | null
  }
}

/** The short label beside the dot. Colour alone is never the message (A4/A8). */
export function mcpLabel(state: McpState): string {
  if (state === 'up') return 'MCP up'
  if (state === 'down') return 'MCP down'
  return 'MCP …'
}

/** What a screen reader announces. Spelled out rather than clever, because this is
 *  the ONLY channel for someone who cannot see the colour. */
export function mcpAriaLabel(state: McpState): string {
  if (state === 'up') return 'MCP server: up'
  if (state === 'down') return 'MCP server: down'
  return 'MCP server: status unknown'
}

/** Tailwind classes per state. Three visually distinct treatments, each carrying a
 *  dark-mode variant, so `down` and `unknown` can never collapse into each other or
 *  into `up` in either theme (A8). Not colour-only: the label above always shows. */
export function mcpDotClass(state: McpState): string {
  if (state === 'up') return 'bg-emerald-500 dark:bg-emerald-400'
  if (state === 'down') return 'bg-rose-500 dark:bg-rose-400'
  return 'bg-slate-300 dark:bg-slate-600'
}

export function mcpTextClass(state: McpState): string {
  if (state === 'up') return 'text-emerald-700 dark:text-emerald-300'
  if (state === 'down') return 'text-rose-700 dark:text-rose-300'
  return 'text-slate-500 dark:text-slate-400'
}

/** Poll only when the page is actually being looked at. Called with
 *  `document.hidden`; kept as a pure function so the rule is testable without a DOM,
 *  which this repo has no harness for. */
export function shouldPoll(documentHidden: boolean): boolean {
  return !documentHidden
}

/** The interval to hand the query layer: a number while visible, `false` to stop.
 *  react-query reads `false` as "do not poll", so pausing is expressed in its own
 *  vocabulary rather than by tearing the query down and losing the last state. */
export function pollInterval(documentHidden: boolean, everyMs: number): number | false {
  return shouldPoll(documentHidden) ? everyMs : false
}

/** What a failed status call should read as. The call failing tells us nothing
 *  about the connector, so it is `unknown`, never `down`. */
export function stateFromQuery(
  payload: McpStatusPayload | undefined,
  isError: boolean,
): McpState {
  if (isError || !payload) return 'unknown'
  return payload.status === 'up' || payload.status === 'down' ? payload.status : 'unknown'
}

/** Tooltip text. Takes an ALREADY-HUMANISED error string rather than the raw one:
 *  `parseFrappeError` reaches for DOMParser, so keeping it out here leaves this
 *  module free of the DOM and therefore testable — this repo has no DOM harness.
 *  The component passes `parseFrappeError(...)` in. `detail.error` needs no such
 *  treatment: it is our own probe's text ("Connection refused"), never HTML. */
export function mcpTooltip(
  state: McpState,
  payload: McpStatusPayload | undefined,
  errorText?: string | null,
): string {
  if (errorText) return `Could not check the MCP server: ${errorText}`
  const detail = payload?.detail
  const lines = [mcpAriaLabel(state)]
  if (payload?.checked_at) lines.push(`Checked ${payload.checked_at}`)
  if (payload?.latency_ms != null) lines.push(`${payload.latency_ms} ms`)
  if (detail && Object.keys(detail).length) {
    if (detail.target) lines.push(`Target ${detail.target}`)
    if (detail.http_status != null) lines.push(`HTTP ${detail.http_status}`)
    if (detail.error) lines.push(detail.error)
  }
  return lines.join(' · ')
}

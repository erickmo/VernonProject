// 5acr99ev9t: one definition of the claude.ai connector link and the words that
// explain it. /m (pages/Profile.tsx) and /w (pages/Me.tsx) render their own
// markup — two different design systems — but the URL, the copy and the rules
// live here so the two cards cannot drift apart again. They already had
// duplicate MCP_URL constants and duplicate prose; that is what this replaces.

export const MCP_URL = 'https://mcp.vernon.id/mcp'

/** Shown when the caller is not a System Manager, so the API returns no real
 *  link. Never paste-able — the placeholder is the point. */
export const MCP_CONNECTOR_PLACEHOLDER = `${MCP_URL}?token=<VERNON_MCP_TOKEN>`

/** What to do with the link once you have it. */
export const CONNECTOR_STEPS = [
  'In claude.ai, open Settings → Connectors → Add custom connector.',
  'Paste this URL exactly as it is, token included.',
  'Name it "Vernon Project" and save.',
  'Start a new chat — the Vernon Project tools appear in the tool list.',
] as const

/** The URL to show: the real one when the API gave us one, the placeholder
 *  otherwise. Kept here so both cards decide identically. */
export const connectorUrlFor = (fromApi: string | null | undefined) =>
  fromApi || MCP_CONNECTOR_PLACEHOLDER

export const hasRealConnector = (fromApi: string | null | undefined) => !!fromApi

/** The toast after copying. A placeholder needs a different instruction from a
 *  working link, and saying the wrong one is how people ended up pasting their
 *  personal key (which 401s). */
export const copiedMessage = (fromApi: string | null | undefined) =>
  hasRealConnector(fromApi)
    ? 'Disalin — tempel apa adanya ke claude.ai'
    : 'Disalin — ganti <VERNON_MCP_TOKEN> dengan token dari admin'

import { describe, expect, it } from 'vitest'
import {
  CONNECTOR_STEPS, MCP_CONNECTOR_PLACEHOLDER, MCP_URL,
  connectorUrlFor, copiedMessage, hasRealConnector,
} from './mcpConnector'

const REAL = 'https://mcp.vernon.id/mcp?token=abc123'

describe('which link the card shows', () => {
  it('uses the real link when the API gave one', () => {
    expect(connectorUrlFor(REAL)).toBe(REAL)
    expect(hasRealConnector(REAL)).toBe(true)
  })

  it('falls back to a placeholder that cannot be pasted by mistake', () => {
    for (const empty of ['', null, undefined]) {
      expect(connectorUrlFor(empty)).toBe(MCP_CONNECTOR_PLACEHOLDER)
      expect(hasRealConnector(empty)).toBe(false)
    }
    expect(MCP_CONNECTOR_PLACEHOLDER).toContain('<VERNON_MCP_TOKEN>')
    expect(MCP_CONNECTOR_PLACEHOLDER.startsWith(MCP_URL)).toBe(true)
  })
})

describe('what the copy toast says', () => {
  it('tells a real link to be pasted as-is', () => {
    expect(copiedMessage(REAL)).toContain('apa adanya')
  })

  it('tells a placeholder to have its token replaced', () => {
    expect(copiedMessage('')).toContain('<VERNON_MCP_TOKEN>')
  })
})

describe('the instructions', () => {
  it('explain where the link goes, not how to run a server', () => {
    const joined = CONNECTOR_STEPS.join(' ')
    expect(joined).toContain('claude.ai')
    expect(joined).toContain('Connectors')
    // The self-hosting steps moved out of this card entirely (5acr99ev9t).
    expect(joined).not.toContain('mcp_server')
    expect(joined).not.toContain('venv')
  })
})

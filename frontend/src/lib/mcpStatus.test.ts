import { describe, expect, it } from 'vitest'
import {
  mcpAriaLabel,
  mcpDotClass,
  mcpLabel,
  mcpTextClass,
  mcpTooltip,
  pollInterval,
  shouldPoll,
  stateFromQuery,
  type McpState,
  type McpStatusPayload,
} from './mcpStatus'

const STATES: McpState[] = ['up', 'down', 'unknown']
const UP: McpStatusPayload = { status: 'up', checked_at: '2026-09-19 12:00:00', latency_ms: 9.1 }

describe('what the dot says', () => {
  it('gives every state a distinct word, so colour is never the only signal', () => {
    const labels = STATES.map(mcpLabel)
    expect(new Set(labels).size).toBe(3)
    expect(labels.every((l) => l.trim().length > 0)).toBe(true)
  })

  it('spells the state out for a screen reader', () => {
    expect(mcpAriaLabel('up')).toBe('MCP server: up')
    expect(mcpAriaLabel('down')).toBe('MCP server: down')
    expect(mcpAriaLabel('unknown')).toBe('MCP server: status unknown')
  })

  it('keeps down and unknown visually distinct from up and from each other', () => {
    const dots = STATES.map(mcpDotClass)
    expect(new Set(dots).size).toBe(3)
  })

  it('carries a dark-mode variant for every state', () => {
    for (const state of STATES) {
      expect(mcpDotClass(state)).toContain('dark:')
      expect(mcpTextClass(state)).toContain('dark:')
    }
  })
})

describe('polling pauses when nobody is looking', () => {
  it('polls while the page is visible', () => {
    expect(shouldPoll(false)).toBe(true)
    expect(pollInterval(false, 60000)).toBe(60000)
  })

  it('stops entirely when the tab is hidden', () => {
    expect(shouldPoll(true)).toBe(false)
    expect(pollInterval(true, 60000)).toBe(false)
  })

  it('expresses the pause as false rather than zero', () => {
    // react-query treats 0 as "poll as fast as you can" — the opposite of the intent.
    expect(pollInterval(true, 60000)).not.toBe(0)
  })
})

describe('reading the query result', () => {
  it('passes through a state the server vouched for', () => {
    expect(stateFromQuery(UP, false)).toBe('up')
    expect(stateFromQuery({ ...UP, status: 'down' }, false)).toBe('down')
  })

  it('is unknown before the first answer arrives, so the navbar can paint immediately', () => {
    expect(stateFromQuery(undefined, false)).toBe('unknown')
  })

  it('is unknown when the call ITSELF failed — never down', () => {
    // A failed request says nothing about the connector. Calling that "down" would
    // report an outage that may not exist.
    expect(stateFromQuery(undefined, true)).toBe('unknown')
    expect(stateFromQuery(UP, true)).toBe('unknown')
  })

  it('treats an unrecognised status as unknown rather than trusting it', () => {
    expect(stateFromQuery({ ...UP, status: 'weird' as McpState }, false)).toBe('unknown')
  })
})

describe('the tooltip', () => {
  it('shows the state in words for a normal user', () => {
    const text = mcpTooltip('up', UP, null)
    expect(text).toContain('MCP server: up')
    expect(text).toContain('9.1 ms')
  })

  it('adds the diagnostic only when the server sent one', () => {
    const plain = mcpTooltip('down', { ...UP, status: 'down' }, null)
    expect(plain).not.toContain('127.0.0.1')

    const admin = mcpTooltip('down', {
      ...UP,
      status: 'down',
      detail: { target: 'http://127.0.0.1:8811/', http_status: null, error: 'Connection refused' },
    }, null)
    expect(admin).toContain('127.0.0.1:8811')
    expect(admin).toContain('Connection refused')
  })

  it('reports a failed check as a sentence, using the text it was handed', () => {
    // The raw-error humanising lives in the component (parseFrappeError needs a DOM);
    // this pins that the tooltip presents it as prose rather than dumping it.
    const text = mcpTooltip('unknown', undefined, 'Not permitted')
    expect(text).toBe('Could not check the MCP server: Not permitted')
  })

  it('falls back to the plain state when there is no error text', () => {
    expect(mcpTooltip('unknown', undefined, null)).toContain('MCP server: status unknown')
  })
})

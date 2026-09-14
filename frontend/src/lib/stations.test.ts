import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { api, ApiError } from './api'
import { STATION_FIELDS, networkFromError, normalizeNetworks } from './stations'

// dk0otn66u1 — the kiosk said "Not Authenticated" for every refusal (wrong network, bad key,
// station off), and neither stations screen had anywhere to set the station's network.

describe('request(): a 403 says why it was refused', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const respond = (status: number, body: unknown) => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    ) as typeof fetch
  }
  const rejection = (p: Promise<unknown>) =>
    p.then(
      () => { throw new Error('expected the call to reject') },
      (e) => e as ApiError,
    )

  it("surfaces the server's reason on 403 and keeps the status", async () => {
    const reason = "This screen is not on the station's office network (203.0.113.7)"
    respond(403, { exc_type: 'PermissionError', _server_messages: JSON.stringify([JSON.stringify({ message: reason })]) })
    const e = await rejection(api.get('vernon_project.api.attendance.station_token', { station: 'HQ', key: 'k' }))
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(403)
    expect(e.message).toBe(reason)
  })

  it('falls back to "Not authenticated" when a 403 carries no message', async () => {
    respond(403, {})
    const e = await rejection(api.get('x.y'))
    expect([e.status, e.message]).toEqual([403, 'Not authenticated'])
  })

  it('still reads a 401 as "not logged in", whatever the body says', async () => {
    respond(401, { message: 'session expired' })
    const e = await rejection(api.get('x.y'))
    expect([e.status, e.message]).toEqual([401, 'Not authenticated'])
  })
})

const WEB = readFileSync(resolve(__dirname, '../../../frontend-web/src/pages/Stations.tsx'), 'utf8')
const MOBILE = readFileSync(resolve(__dirname, '../pages/AttendanceStationsScreen.tsx'), 'utf8')
const KIOSK = readFileSync(resolve(__dirname, '../../../frontend-web/src/pages/Kiosk.tsx'), 'utf8')
const HOOK = readFileSync(resolve(__dirname, '../hooks/useStationNetworks.ts'), 'utf8')

describe('station networks', () => {
  it('loads allowed_networks with every station', () => {
    expect(STATION_FIELDS).toContain('allowed_networks')
  })

  it('saves the textarea as one network per line, blanks dropped', () => {
    expect(normalizeNetworks(' 203.0.113.7 \n\n 10.0.0.0/24\r\n')).toBe('203.0.113.7\n10.0.0.0/24')
    expect(normalizeNetworks('   \n ')).toBe('')
  })

  it('pulls the IP the server saw out of the kiosk network refusal', () => {
    expect(networkFromError("This screen is not on the station's office network (203.0.113.7)")).toBe('203.0.113.7')
    expect(networkFromError("This screen is not on the station's office network (2001:db8::1)")).toBe('2001:db8::1')
    expect(networkFromError('Invalid station key')).toBe('')
    expect(networkFromError("This screen is not on the station's office network (None)")).toBe('')
  })

  it('both stations screens read and edit allowed_networks, and the kiosk shows the blocked IP', () => {
    for (const src of [WEB, MOBILE]) {
      expect(src).toMatch(/fields: STATION_FIELDS/)
      expect(src).toMatch(/useStationNetworks\(/)
    }
    // One save path for both screens, through the doctype's own write permission.
    expect(HOOK).toMatch(/saveNetworks\(/)
    expect(KIOSK).toMatch(/networkFromError\(/)
  })
})

// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { isSafeUrl, rewardRedemptionStatusLabel, sanitizeHtml, seenRange, styleFetchesRemote } from './format'

describe('isSafeUrl / sanitizeHtml links (allowlist, not blocklist)', () => {
  const blocked = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'java\tscript:alert(1)', // tab inside the scheme: the URL parser strips it
    'java\nscript:alert(1)',
    '\u0001javascript:alert(1)', // leading C0 control char, also stripped
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ]
  const allowed = ['https://example.com/a', 'http://example.com', 'mailto:a@b.co', '/app/todo/1', 'todo/1', '#section']

  it('rejects every scheme but http(s)/mailto, however it is spelled', () => {
    for (const u of blocked) expect(isSafeUrl(u), JSON.stringify(u)).toBe(false)
  })

  it('keeps web links, mailto, relative paths and anchors', () => {
    for (const u of allowed) expect(isSafeUrl(u), u).toBe(true)
  })

  it('strips unsafe hrefs from HTML, including the entity-encoded tab variant', () => {
    for (const p of ['java&#9;script:alert(1)', 'java&#x0A;script:alert(1)', 'javascript:alert(1)', 'data:text/html,x', 'vbscript:x']) {
      const html = sanitizeHtml(`<a href="${p}">x</a><svg><a xlink:href="${p}">y</a></svg>`)
      expect(html, p).not.toMatch(/href=/i)
    }
  })

  it('keeps safe hrefs in HTML', () => {
    const html = sanitizeHtml('<a href="https://example.com">a</a><a href="mailto:a@b.co">b</a><a href="/files/x.pdf">c</a>')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('href="mailto:a@b.co"')
    expect(html).toContain('href="/files/x.pdf"')
  })
})

describe('rewardRedemptionStatusLabel', () => {
  it('labels Fulfilled correctly', () => {
    expect(rewardRedemptionStatusLabel('Fulfilled')).toBe('Fulfilled')
  })

  it('never claims delivery for a status that is not actually Fulfilled', () => {
    // The exact drift this guards: the old inline `r.status === 'Pending' ?
    // <button> : 'Fulfilled'` treated any non-Pending status as delivered.
    expect(rewardRedemptionStatusLabel('Cancelled')).toBe('Cancelled')
    expect(rewardRedemptionStatusLabel('Cancelled')).not.toBe('Fulfilled')
  })
})

describe('styleFetchesRemote (comment sanitizer: no remote pixels via inline CSS)', () => {
  it('catches the live WhatsApp emoji sprite and every spelling of a fetch', () => {
    const live = 'background-image: url("https://web.whatsapp.com/emoji/v1/16/0/2/single/w/40/002705.png"); '
    for (const css of [
      live,
      'background:URL(https://t.example/p.gif)',
      'background:\\75 rl(https://t.example/p.gif)', // CSS escape: \75 = "u"
      'background:u\\72l(https://t.example/p.gif)', // \72 = "r"
      'background:u\\rl(https://t.example/p.gif)', // escaped non-hex char
      'background:ur/**/l(https://t.example/p.gif)', // comment split (over-match is fine)
      'background-image:image-set("https://t.example/p.png" 1x)', // bare-string URL, no url()
      'background-image:-webkit-image-set("https://t.example/p.png" 1x)',
      'mask:src("https://t.example/m.svg")',
    ]) {
      expect(styleFetchesRemote(css), css).toBe(true)
    }
  })

  it('keeps ordinary formatting, including the app’s own inline-image style', () => {
    for (const css of [
      'color: rgb(16, 24, 40); background-color: rgb(255, 255, 255); font-weight: 600;',
      'max-width:100%;border-radius:0.5rem;',
      'text-align: center',
      '',
    ]) {
      expect(styleFetchesRemote(css), css).toBe(false)
    }
  })
})

describe('seenRange (attendance first/last seen)', () => {
  it('shows one time when seen once and a range after a later scan', () => {
    expect(seenRange(null, null)).toBe('')
    expect(seenRange('2026-09-11 08:03:12', '2026-09-11 08:03:12')).toBe('08:03')
    expect(seenRange('2026-09-11 08:03:12', null)).toBe('08:03')
    expect(seenRange('2026-09-11 08:03:12', '2026-09-11 17:05:00')).toBe('08:03–17:05')
  })
})

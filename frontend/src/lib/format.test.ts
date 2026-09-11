import { describe, it, expect } from 'vitest'
import { rewardRedemptionStatusLabel, styleFetchesRemote } from './format'

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

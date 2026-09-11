import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// CommentThread is shared by /m and /w. Every light-only colour utility on it
// (gray/white) must carry a dark: counterpart, or the comment renders a white
// box in dark mode (todo omfjml5bl6).
const src = readFileSync(new URL('./CommentThread.tsx', import.meta.url), 'utf8')
const classStrings = [...src.matchAll(/className="([^"]+)"|className=\{`([^`]+)`\}|=\s*'(dark:[^']+)'/g)]
  .map((m) => m[1] ?? m[2] ?? m[3])

describe('CommentThread dark mode', () => {
  it('dark_mode_comment_background_uses_dark_theme_token', () => {
    const missing: string[] = []
    for (const s of classStrings) {
      const tokens = s.split(/\s+/)
      for (const t of tokens) {
        const m = t.match(/^((?:hover|empty:before):)?(bg|text|border)-(gray-\d+|white)$/)
        if (m && t !== 'text-white' && !tokens.some((d) => d.startsWith(`dark:${m[1] ?? ''}${m[2]}-`))) missing.push(t)
      }
    }
    expect(missing).toEqual([])
  })

  it('pasted inline colours are neutralised in dark mode only', () => {
    expect(src).toContain('dark:[&_[style]]:!bg-transparent')
    expect(src).toContain('dark:[&_[style]]:!text-inherit')
    // light mode stays as authored: no un-prefixed override of pasted styles
    expect(src).not.toMatch(/[\s"'`]\[&_\[style\]\]:/)
  })
})

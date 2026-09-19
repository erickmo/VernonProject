import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// The requirement is "one shared helper feeds both navbars — a grep shows no second
// implementation and no duplicated polling logic". A grep proves that on the day
// someone runs it; this keeps it true afterwards. Source-text assertions, because
// this repo ships no DOM harness (same approach as createTodoSubmitGuard.test.ts).

const M = resolve(__dirname, '../..', 'src')
const W = resolve(__dirname, '../../..', 'frontend-web', 'src')

function sourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
    }
  }
  walk(root)
  return out
}

const ALL = [...sourceFiles(M), ...sourceFiles(W)]
const read = (f: string) => readFileSync(f, 'utf8')

describe('one implementation, used by both navbars', () => {
  it('only the shared api module names the endpoint', () => {
    const callers = ALL.filter((f) => read(f).includes('get_mcp_status'))
    expect(callers.map((f) => f.replace(M, '/m').replace(W, '/w'))).toEqual(['/m/lib/api.ts'])
  })

  it('only one hook polls it', () => {
    const pollers = ALL.filter((f) => read(f).includes('mcpApi.status'))
    expect(pollers.map((f) => f.replace(M, '/m').replace(W, '/w'))).toEqual(['/m/hooks/useData.ts'])
  })

  it('only one component draws it', () => {
    const definers = ALL.filter((f) => /export function McpStatusIndicator/.test(read(f)))
    expect(definers).toHaveLength(1)
  })

  it('both navbars render that one component', () => {
    // /w's top bar and /m's tab-screen header — the two places confirmed as the
    // navbar in each app. /m deliberately uses the dot-only form.
    expect(read(join(W, 'components', 'TopNav.tsx'))).toContain('<McpStatusIndicator')
    const mobileHeader = read(join(M, 'components', 'Layout.tsx'))
    expect(mobileHeader).toContain('<McpStatusIndicator')
    expect(mobileHeader).toContain('labelled={false}')
  })

  it('the component humanises errors rather than showing raw text', () => {
    // mcpTooltip takes an already-humanised string, so the humanising has to happen
    // here; this pins that it does.
    const component = read(join(M, 'components', 'McpStatusIndicator.tsx'))
    expect(component).toContain('parseFrappeError')
  })

  it('the poll interval comes from the shared pure rule, not a literal', () => {
    const hook = read(join(M, 'hooks', 'useData.ts'))
    expect(hook).toContain('pollInterval(hidden')
    expect(hook).toContain("addEventListener('visibilitychange'")
  })
})

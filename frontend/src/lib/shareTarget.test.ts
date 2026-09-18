// @vitest-environment happy-dom -- the ingest->render assertion below needs sanitizeHtml's DOMParser
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSharedPayload, sharedTodoInitial } from './shareTarget'
import { renderNoteMarkdown } from './markdown'

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')

describe('the PWA is registered as a share target', () => {
  const manifest = JSON.parse(read('../../public/manifest.json'))

  it('declares a GET share target inside its own scope', () => {
    const st = manifest.share_target
    expect(st).toBeTruthy()
    expect(st.method ?? 'GET').toBe('GET')
    // GET + a plain query string is the lean form: no service-worker POST handler,
    // no multipart body, nothing to keep in sync with the SW.
    expect(st.action.startsWith(manifest.scope)).toBe(true)
    expect(st.params).toEqual({ title: 'title', text: 'text', url: 'url' })
  })

  it('leaves the existing install identity alone', () => {
    // Changing any of these re-installs the PWA as a different app.
    expect(manifest.id).toBe('/m')
    expect(manifest.scope).toBe('/m')
    expect(manifest.start_url).toBe('/m')
    expect(manifest.share_target.enctype).toBeUndefined()
  })
})

describe('parseSharedPayload', () => {
  it('carries title, text and url through as prefill', () => {
    const p = parseSharedPayload(
      '?title=Reel+ide&text=Bagus+buat+konten&url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC%2F',
    )
    expect(p).toEqual({
      title: 'Reel ide',
      text: 'Bagus buat konten',
      url: 'https://www.instagram.com/reel/ABC/',
    })
  })

  it('finds the link when the sharer put it in text (Android IG/Threads)', () => {
    // Instagram and Threads on Android hand the permalink over inside `text`, with
    // no `url` param at all -- the commonest real payload, and the one a url-only
    // reader drops on the floor.
    const p = parseSharedPayload('?text=Lihat+ini+https%3A%2F%2Fwww.threads.net%2F%40x%2Fpost%2F1')
    expect(p?.url).toBe('https://www.threads.net/@x/post/1')
    expect(p?.text).toBe('Lihat ini https://www.threads.net/@x/post/1')
  })

  it('refuses a url that is not http(s)', () => {
    expect(parseSharedPayload('?text=hi&url=javascript%3Aalert(1)')?.url).toBe('')
    expect(parseSharedPayload('?text=hi&url=data%3Atext%2Fhtml%2C%3Cscript%3E')?.url).toBe('')
  })

  it('returns null when there is nothing usable to prefill', () => {
    expect(parseSharedPayload('')).toBeNull()
    expect(parseSharedPayload('?')).toBeNull()
    expect(parseSharedPayload('?foo=bar')).toBeNull()
    expect(parseSharedPayload('?url=javascript%3Aalert(1)')).toBeNull()
    expect(parseSharedPayload('?title=+++&text=')).toBeNull()
  })

  it('strips control characters and caps the length', () => {
    const noisy = encodeURIComponent(`a${String.fromCharCode(0)}b${String.fromCharCode(27)}c`)
    const p = parseSharedPayload(`?title=${noisy}&text=${encodeURIComponent('x'.repeat(9000))}`)
    expect(p?.title).toBe('abc')
    expect(p!.text.length).toBeLessThanOrEqual(4000)
  })
})

describe('sharedTodoInitial', () => {
  it('titles the todo from the share and keeps the source in the notes', () => {
    const p = parseSharedPayload(
      '?title=Reel+ide&text=Bagus&url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC%2F',
    )!
    const initial = sharedTodoInitial(p)
    expect(initial.toDo).toBe('Reel ide')
    expect(initial.notes).toContain('Bagus')
    expect(initial.notes).toContain('https://www.instagram.com/reel/ABC/')
  })

  it('falls back to the first line of the text, then the url, for the title', () => {
    expect(sharedTodoInitial(parseSharedPayload('?text=Baris+satu%0ABaris+dua')!).toDo).toBe('Baris satu')
    expect(sharedTodoInitial(parseSharedPayload('?url=https%3A%2F%2Fthreads.net%2Fp%2F1')!).toDo).toBe(
      'https://threads.net/p/1',
    )
  })

  it('never lets shared content render as executable markup', () => {
    const title = encodeURIComponent('<img src=x onerror=alert(1)>')
    const text = encodeURIComponent('[tap](javascript:alert(1))\n<script>alert(1)</script>')
    const html = renderNoteMarkdown(sharedTodoInitial(parseSharedPayload(`?title=${title}&text=${text}`)!).notes)
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/onerror/i)
    expect(html).not.toMatch(/javascript:/i)
  })
})

describe('the receiving screen opens the form instead of creating anything', () => {
  // A source assertion, same reasoning as createTodoSubmitGuard.test.ts: every test
  // in src/lib is pure and this app ships no testing-library.
  const screen = read('../pages/ShareTargetScreen.tsx')

  it('never calls the create mutation itself', () => {
    // The only create path is the ordinary CreateProjectItemSheet the manual flow
    // uses, submitted by the user. A share that auto-created would turn every
    // duplicate delivery into a duplicate todo.
    expect(screen).not.toMatch(/useCreateProjectItem/)
    expect(screen).toMatch(/CreateProjectItemSheet/)
  })

  it('mounts the form only once a project detail is chosen', () => {
    expect(screen).toMatch(/dialogOpen && [a-zA-Z]+\.detailData/)
  })
})

describe('the manifest Android reads before it offers Vernon in the share sheet', () => {
  // The document Frappe actually serves at /m is www/m.html — the built index.html is
  // only the offline fallback — so BOTH have to point at the manifest, or the installed
  // app reads one that is not there.
  const DOCS = {
    'www/m.html': readFileSync(resolve(__dirname, '../../../vernon_project/www/m.html'), 'utf8'),
    'frontend/index.html': readFileSync(resolve(__dirname, '../../index.html'), 'utf8'),
  }
  const SW = readFileSync(resolve(__dirname, '../../sw-custom.js'), 'utf8')
  const hrefOf = (html: string) => /<link rel="manifest" href="([^"]+)"/.exec(html)?.[1] ?? ''

  it('is served under a media type the manifest spec accepts', () => {
    // Android registers the share target from the installed app's MANIFEST, so a
    // manifest the browser will not parse is a share sheet with no Vernon in it. The
    // spec wants a JSON media type; this site's nginx has no mapping for
    // `.webmanifest` and returns `application/octet-stream`, while `.json` it returns
    // as `application/json` (both checked live on project.vernon.id). Naming the file
    // `.json` is the entire fix — no server change, nothing to reload. Changing the
    // manifest URL is safe because the manifest carries an explicit `id`, which is
    // what an installed app is keyed on.
    for (const [where, html] of Object.entries(DOCS)) {
      expect(hrefOf(html), where).toMatch(/\.json$/)
    }
  })

  it('is the same manifest from both documents', () => {
    expect(hrefOf(DOCS['www/m.html'])).toBe(hrefOf(DOCS['frontend/index.html']))
  })

  it('is never served from the service worker cache', () => {
    // Everything under the asset prefix is cache-first because it is content-hashed.
    // The manifest is not: cache-first pinned the pre-share_target copy on every
    // install until v43 renamed the whole cache to flush it. Excluding it by name is
    // what stops the next manifest edit needing the same trick.
    const guard = /url\.pathname\.endsWith\('manifest\.json'\)/
    expect(SW).toMatch(guard)
    expect(SW.indexOf('manifest.json')).toBeLessThan(SW.indexOf('cacheFirst(req, ASSET_CACHE)'))
  })
})

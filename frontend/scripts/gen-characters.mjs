// Generate character avatar PNGs via Replicate and drop them into
// public/characters/ (the drop-in override the app already reads).
//
// YOU run this — it uses YOUR token and YOUR prompts. Neutral tooling: the
// prompts live in characters.prompts.json and are yours to write.
//
//   REPLICATE_API_TOKEN=r8_xxx node scripts/gen-characters.mjs        # generate
//   node scripts/gen-characters.mjs --dry                              # validate only, no API calls
//   npm run build                                                      # deploy the new PNGs
//
// Optional: REPLICATE_MODEL=black-forest-labs/flux-1.1-pro (default: flux-schnell, cheap/fast).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const dry = process.argv.includes('--dry')
const promptsUrl = new URL('../characters.prompts.json', import.meta.url)
const outDir = new URL('../public/characters/', import.meta.url)

let prompts
try { prompts = JSON.parse(readFileSync(promptsUrl)) }
catch (e) { console.error('Cannot read characters.prompts.json:', e.message); process.exit(1) }

const entries = Object.entries(prompts)
const filled = entries.filter(([, p]) => p && p.trim())
console.log(`${entries.length} files, ${filled.length} with prompts, ${entries.length - filled.length} empty (skipped).`)

if (dry) {
  for (const [f, p] of entries) console.log(`  ${p && p.trim() ? '✓' : '·'} ${f}${p && p.trim() ? '  — ' + p.slice(0, 60) : ''}`)
  console.log('dry run: no API calls made.')
  process.exit(0)
}

const token = process.env.REPLICATE_API_TOKEN
if (!token) { console.error('Set REPLICATE_API_TOKEN (get one at https://replicate.com/account/api-tokens).'); process.exit(1) }
const MODEL = process.env.REPLICATE_MODEL || 'black-forest-labs/flux-schnell'
mkdirSync(outDir, { recursive: true })

for (const [file, prompt] of filled) {
  process.stdout.write(`gen ${file} ... `)
  try {
    const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait' },
      body: JSON.stringify({ input: { prompt, aspect_ratio: '1:1', output_format: 'png', num_outputs: 1 } }),
    })
    const j = await res.json()
    if (!res.ok) { console.log('FAIL', j.detail || j.title || res.status); continue }
    const url = Array.isArray(j.output) ? j.output[0] : j.output
    if (!url) { console.log('no output:', JSON.stringify(j).slice(0, 140)); continue }
    const img = Buffer.from(await (await fetch(url)).arrayBuffer())
    writeFileSync(new URL(file, outDir), img)
    console.log('saved', img.length, 'bytes')
  } catch (e) { console.log('ERROR', e.message) }
}
console.log('done — now run: npm run build')

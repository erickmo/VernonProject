import { strict as assert } from 'node:assert'
import {
  AUTO_COMPONENTS, CERT_HELP, RUBRIC_TEMPLATE, canDownload, certHelp, clampScore,
  componentLabel, droppedComponents, fmtScore, gradeFor, gradeTone, rubricFrom,
  rubricProgress, rubricScore,
} from './certificate'

// --- weights line up with the server -------------------------------------------------
assert.equal(AUTO_COMPONENTS.reduce((a, c) => a + c.weight, 0), 100)
assert.equal(RUBRIC_TEMPLATE.reduce((a, c) => a + c.weight, 0), 100)
assert.equal(new Set(RUBRIC_TEMPLATE.map((r) => r.key)).size, RUBRIC_TEMPLATE.length)

// --- grades --------------------------------------------------------------------------
assert.equal(gradeFor(85), 'A')
assert.equal(gradeFor(84.9), 'B')
assert.equal(gradeFor(70), 'B')
assert.equal(gradeFor(69.9), 'C')
assert.equal(gradeFor(55), 'C')
assert.equal(gradeFor(54.9), 'D')
assert.equal(gradeFor(0), 'D')
assert.equal(gradeFor(null), null)
assert.equal(gradeFor(undefined), null)
assert.equal(gradeTone('A'), 'good')
assert.equal(gradeTone(null), 'none')

// --- a missing score is a dash, never a zero ------------------------------------------
assert.equal(fmtScore(null), '—')
assert.equal(fmtScore(undefined), '—')
assert.equal(fmtScore(0), '0.0')
assert.equal(fmtScore(88), '88.0')

// --- rubric maths mirrors the server --------------------------------------------------
const full = [
  { weight: 30, score: 90 }, { weight: 20, score: 80 },
  { weight: 20, score: null }, { weight: 15, score: null }, { weight: 15, score: null },
]
// unscored lines ignored: (90*30 + 80*20) / 50 = 86, NOT 43
assert.equal(rubricScore(full), 86)
assert.equal(rubricScore([{ weight: 30, score: 0 }, { weight: 20, score: 100 }]), 40)
assert.equal(rubricScore([]), null)
assert.equal(rubricScore([{ weight: 30, score: null }]), null)
assert.equal(rubricScore([{ weight: 0, score: 100 }]), null)
assert.equal(rubricScore([{ weight: 1, score: 500 }]), 100)
assert.equal(rubricScore([{ weight: 1, score: -5 }]), 0)
assert.equal(rubricScore([{ weight: 1, score: NaN }]), null)

assert.deepEqual(rubricProgress(full), { done: 2, total: 5 })
assert.deepEqual(rubricProgress([]), { done: 0, total: 0 })

// --- clamping happens on commit, and an empty box means "not judged" -------------------
assert.equal(clampScore(''), null)
assert.equal(clampScore('   '), null)
assert.equal(clampScore('abc'), null)
assert.equal(clampScore('90'), 90)
assert.equal(clampScore('0'), 0)
assert.equal(clampScore('120'), 100)
assert.equal(clampScore('-4'), 0)

// --- dropped components are named, not silently missing --------------------------------
assert.deepEqual(
  droppedComponents({ components: [
    { key: 'completion', label: '', weight: 30, value: 100, points: 30, detail: '' },
    { key: 'timeliness', label: '', weight: 25, value: 100, points: 25, detail: '' },
  ] }),
  ['attendance', 'contribution', 'learning'],
)
assert.deepEqual(droppedComponents({ components: [] }), AUTO_COMPONENTS.map((c) => c.key))
assert.equal(componentLabel('learning'), 'Pembelajaran')
assert.equal(componentLabel('mystery'), 'mystery')

// --- rubric merge keeps a criterion that an old draft never had ------------------------
const merged = rubricFrom({ rubric: [
  { label: 'Kualitas Kerja', weight: 30, score: 77, comment: 'rapi' },
] })
assert.equal(merged.length, RUBRIC_TEMPLATE.length)
assert.equal(merged[0].score, 77)
assert.equal(merged[0].comment, 'rapi')
assert.equal(merged[1].score, null, 'criteria absent from the saved doc stay unjudged')
assert.equal(rubricFrom(null).every((r) => r.score === null), true)

// --- download is published-only --------------------------------------------------------
assert.equal(canDownload({ status: 'Published' }), true)
for (const s of ['Draft', 'Pending HR', 'Revoked'] as const) {
  assert.equal(canDownload({ status: s }), false, s)
}

// --- help copy is complete and addressable ---------------------------------------------
assert.equal(new Set(CERT_HELP.map((h) => h.term)).size, CERT_HELP.length)
for (const h of CERT_HELP) {
  assert.ok(h.title.length > 5 && h.body.length > 40, h.term)
  assert.equal(certHelp(h.term), h)
}
assert.equal(certHelp('nope'), undefined)
for (const term of ['dua-nilai', 'nilai-berubah', 'komponen-hilang', 'qr', 'dicabut']) {
  assert.ok(certHelp(term), `missing help for ${term}`)
}

console.log('certificate self-check OK')

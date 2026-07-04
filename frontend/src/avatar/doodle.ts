// Custom "doodle" avatar style — original hand-drawn line-art with a top-half
// body (unlike DiceBear croodles, which is face-only). Composed from pickable
// face / hair / top variants, so it plugs into the normal slot-based customizer.
// Rendered inline like a DiceBear SVG via renderAvatarSvg('doodle', options).

const S = 'stroke="#2b2b2b" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"'
const FILL = 'fill="#fff" stroke="#2b2b2b" stroke-width="2.2" stroke-linejoin="round"'

const HEAD =
  `<path d='M29 40 Q27 19 50 18 Q73 19 71 40 Q72 59 50 61 Q28 59 29 40 Z' ${FILL}/>` +
  `<path d='M44 60 Q43 64 42 67' ${S}/><path d='M56 60 Q57 64 58 67' ${S}/>`

const TOP = [
  `<path d='M20 100 Q18 78 40 69 Q50 75 60 69 Q82 78 80 100' ${FILL}/><path d='M42 69 Q50 77 58 69' ${S}/>`,
  `<path d='M20 100 Q18 78 40 69 Q50 75 60 69 Q82 78 80 100' ${FILL}/><path d='M42 69 L37 76 L46 74' ${S}/><path d='M58 69 L63 76 L54 74' ${S}/><path d='M50 76 L50 96' ${S}/><circle cx='50' cy='82' r='1' fill='#2b2b2b'/><circle cx='50' cy='89' r='1' fill='#2b2b2b'/>`,
  `<path d='M20 100 Q18 78 40 69 Q50 75 60 69 Q82 78 80 100' ${FILL}/><path d='M36 70 Q50 62 64 70' ${S}/><path d='M46 72 L45 84' ${S}/><path d='M54 72 L55 84' ${S}/>`,
  `<path d='M20 100 Q18 78 40 69 Q50 75 60 69 Q82 78 80 100' ${FILL}/><path d='M42 69 Q50 77 58 69' ${S}/><path d='M24 82 Q50 86 76 82' ${S}/><path d='M22 92 Q50 96 78 92' ${S}/>`,
  `<path d='M24 100 Q22 82 40 74 Q50 79 60 74 Q78 82 76 100' ${FILL}/><path d='M40 74 L44 68' ${S}/><path d='M60 74 L56 68' ${S}/>`,
]

const HAIR = [
  `<path d='M30 35 Q28 16 50 15 Q72 16 70 35' ${S}/><path d='M36 20 Q40 16 45 18' ${S}/><path d='M55 18 Q60 16 64 20' ${S}/>`,
  `<path d='M30 34 L34 20 L39 30 L44 16 L50 28 L56 16 L61 30 L66 20 L70 34' ${S}/>`,
  `<path d='M30 34 Q26 22 34 22 Q30 14 40 17 Q42 10 50 15 Q58 10 60 17 Q70 14 66 22 Q74 22 70 34' ${S}/>`,
  `<circle cx='50' cy='13' r='6' ${FILL}/><path d='M31 34 Q30 20 50 19 Q70 20 69 34' ${S}/>`,
  `<path d='M30 36 Q27 15 50 14 Q73 15 70 36' ${S}/><path d='M30 34 Q26 48 30 58' ${S}/><path d='M70 34 Q74 48 70 58' ${S}/>`,
]

const FACE = [
  `<circle cx='42' cy='40' r='2.2' fill='#2b2b2b'/><circle cx='58' cy='40' r='2.2' fill='#2b2b2b'/><path d='M43 48 Q50 54 57 48' ${S}/>`,
  `<path d='M38 41 Q42 37 46 41' ${S}/><path d='M54 41 Q58 37 62 41' ${S}/><path d='M45 49 Q50 52 55 49' ${S}/>`,
  `<path d='M38 40 Q42 37 46 40' ${S}/><circle cx='58' cy='40' r='2.2' fill='#2b2b2b'/><path d='M43 49 Q51 54 57 48' ${S}/>`,
  `<circle cx='42' cy='40' r='2.6' fill='#2b2b2b'/><circle cx='58' cy='40' r='2.6' fill='#2b2b2b'/><ellipse cx='50' cy='50' rx='3.5' ry='4.5' ${S}/>`,
  `<circle cx='42' cy='40' r='5' ${S}/><circle cx='58' cy='40' r='5' ${S}/><path d='M47 40 L53 40' ${S}/><circle cx='42' cy='40' r='1.6' fill='#2b2b2b'/><circle cx='58' cy='40' r='1.6' fill='#2b2b2b'/><path d='M44 50 Q50 53 56 50' ${S}/>`,
]

const SLOTS: Record<string, string[]> = { top: TOP.map((_, i) => `v${i}`), hair: HAIR.map((_, i) => `v${i}`), face: FACE.map((_, i) => `v${i}`) }
const DATA: Record<string, string[]> = { top: TOP, hair: HAIR, face: FACE }

const idx = (v?: string) => (v && /^v(\d+)$/.test(v) ? +v.slice(1) : 0)
const pick = (slot: string, opts: Record<string, string[]>) => {
  const arr = DATA[slot]
  return arr[idx(opts[slot]?.[0]) % arr.length]
}

export function renderDoodle(options: Record<string, string[]> = {}): string {
  const bgv = options.backgroundColor?.[0]
  const bg = bgv && bgv !== 'transparent' ? `<rect width='100' height='100' fill='#${bgv}'/>` : ''
  // order: face + eyebrows shown after hair; body behind head
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>${bg}${pick('top', options)}${HEAD}${pick('hair', options)}${pick('face', options)}</svg>`
}

// Slots the customizer shows for the doodle style (face / hair / top, 5 each).
export function doodleSlots(): { slot: string; values: string[] }[] {
  return ['face', 'hair', 'top'].map((slot) => ({ slot, values: SLOTS[slot] }))
}

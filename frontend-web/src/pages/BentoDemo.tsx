import { BentoGrid, BentoTile, BentoStat, type Accent, type Tone, type Span } from '@web/components/bento'

const ACCENTS: Accent[] = ['brand', 'amber', 'violet', 'sky', 'emerald', 'rose', 'slate']
const TONES: Tone[] = ['plain', 'tint', 'gradient', 'solid']
const SPANS: Span[] = ['sm', 'md', 'lg', 'wide', 'full']

export default function BentoDemo() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Bento demo</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">Spans</h2>
        <BentoGrid>
          {SPANS.map((s) => (
            <BentoTile key={s} span={s} tone="tint" accent="brand" title={s}>
              <BentoStat value={s} label="span" />
            </BentoTile>
          ))}
        </BentoGrid>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">Tones × accents</h2>
        <BentoGrid>
          {ACCENTS.flatMap((a) =>
            TONES.map((t) => (
              <BentoTile key={a + t} span="sm" tone={t} accent={a} title={`${a}`} subtitle={t}>
                <BentoStat value="42" label={`${a}/${t}`} />
              </BentoTile>
            )),
          )}
        </BentoGrid>
      </section>
    </div>
  )
}

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Avatar, EmptyState, FullScreenLoader, Segmented } from '@/components/ui'
import { SPIcon } from '@/lib/spIcon'
import { useSuperpowerWall } from '@/hooks/useData'
import type { SuperpowerWallGroup, SuperpowerWallUser } from '@/lib/types'

type Sub = 'scored' | 'claimed'
const SUBS: { value: Sub; label: string }[] = [
  { value: 'scored', label: 'Dinilai' },
  { value: 'claimed', label: 'Dipilih sendiri' },
]

// Team-wall superpower view with two sub-tabs. Dinilai = peer-voted strengths
// (avg > 7.5, anonymous) + earned Kinerja, each member badged with their 0–10 score.
// Dipilih sendiri = who self-declared each trait, no scores. Shared by /m and /w.
export function SuperpowerWall() {
  const { data, isLoading } = useSuperpowerWall()
  const [sub, setSub] = useState<Sub>('scored')

  if (isLoading && !data) return <FullScreenLoader />

  const all = data?.groups ?? []
  const groups =
    sub === 'claimed'
      ? all.filter((g) => g.kind === 'SelfClaimed')
      : all.filter((g) => g.kind === 'Voted' || g.kind === 'Performance')

  return (
    <div className="mt-4 space-y-5">
      <Segmented options={SUBS} value={sub} onChange={setSub} />

      <p className="rounded-2xl bg-paper-line/60 dark:bg-slate-800/60 px-4 py-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {sub === 'scored' ? (
          <>
            Penilaian rekan bersifat <b>anonim</b> dan bertujuan membantu setiap orang mengenali serta
            mengembangkan kekuatannya. Hanya superpower dengan skor rata-rata di atas 7,5 yang tampil di sini.
          </>
        ) : (
          <>Superpower yang dipilih sendiri oleh setiap rekan.</>
        )}
      </p>

      {groups.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={sub === 'claimed' ? 'Belum ada klaim' : 'Belum ada superpower'}
          subtitle={
            sub === 'claimed'
              ? 'Belum ada rekan yang memilih superpower.'
              : 'Superpower unggulan muncul saat skor rata-rata rekan melebihi ambang.'
          }
        />
      ) : (
        groups.map((g) => <Group key={`${g.kind}-${g.superpower}`} g={g} />)
      )}
    </div>
  )
}

function Group({ g }: { g: SuperpowerWallGroup }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <SPIcon icon={g.icon || undefined} color={g.color || undefined} className="h-5 w-5" />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{g.name}</h3>
        {g.kind === 'Performance' && (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:bg-brand-500/20 dark:text-brand-300">
            Kinerja
          </span>
        )}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {g.count}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {g.users.map((u) => (
          <Member key={u.name} u={u} />
        ))}
      </div>
    </section>
  )
}

function Member({ u }: { u: SuperpowerWallUser }) {
  const label = u.full_name || u.name
  return (
    <div className="flex w-16 flex-col items-center gap-1" title={label}>
      <div className="relative">
        <Avatar name={label} image={u.user_image} config={u.avatar_config} size={56} rounded />
        {u.score > 0 && (
          <span className="absolute -right-1 -top-1 min-w-6 rounded-full bg-brand-500 px-1 text-center text-[11px] font-bold leading-5 text-white ring-2 ring-white dark:ring-slate-900">
            {u.score.toFixed(1)}
          </span>
        )}
      </div>
      <span className="line-clamp-1 w-full text-center text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
      </span>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Sparkles, Star, Zap, Trash2, Trophy, Check } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Avatar, EmptyState, FullScreenLoader, Segmented, Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import {
  useBoot,
  useUserSuperpowers,
  useSuperpowers,
  useSetMySuperpowers,
  useVotableUsers,
  useCastVote,
  useRemoveVote,
} from '@/hooks/useData'
import type { PerfSuperpower, SuperpowerLevel, VotedSuperpower } from '@/lib/types'

type TabKey = 'mine' | 'voted' | 'others' | 'perf'

// Robust icon: catalog/level icons may be an emoji OR a lucide name. We only
// render the glyph when it's clearly an emoji (any non-latin1 char); a bare
// lucide word like "Zap" would look wrong, so it falls back to a colored dot.
function SpIcon({ icon, color, className }: { icon?: string; color?: string; className?: string }) {
  const isGlyph = !!icon && /[^ -ÿ]/.test(icon)
  if (isGlyph) return <span className={className}>{icon}</span>
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color || '#94a3b8' }}
    />
  )
}

function LevelBadge({ level }: { level: SuperpowerLevel | null }) {
  if (!level)
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
        Belum ada level
      </span>
    )
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${level.color}22`, color: level.color }}
    >
      <SpIcon icon={level.icon} color={level.color} />
      {level.level_name}
    </span>
  )
}

// 0–10 selector (11 wrapping buttons). `value` is the viewer's current vote.
function VoteScale({
  value,
  color,
  onPick,
  disabled,
}: {
  value: number | null
  color?: string
  onPick: (n: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: 11 }, (_, n) => {
        const active = value === n
        return (
          <button
            key={n}
            disabled={disabled}
            onClick={() => onPick(n)}
            className={clsx(
              'h-9 w-9 rounded-lg text-sm font-semibold transition active:scale-90 disabled:opacity-50',
              active ? 'text-white' : 'bg-paper-line text-stone-600 dark:bg-slate-700 dark:text-slate-300',
            )}
            style={active ? { backgroundColor: color || '#6366f1' } : undefined}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

function VotedCard({ item, ratee, canVote }: { item: VotedSuperpower; ratee: string; canVote: boolean }) {
  const cast = useCastVote()
  const remove = useRemoveVote()
  const toast = useToast()
  const busy = cast.isPending || remove.isPending

  const onPick = (score: number) =>
    cast.mutate(
      { ratee, superpower: item.superpower, score },
      {
        onSuccess: () => toast('success', 'Suara tersimpan'),
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menyimpan suara'),
      },
    )

  const onRemove = () =>
    remove.mutate(
      { ratee, superpower: item.superpower },
      {
        onSuccess: () => toast('success', 'Suara dihapus'),
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menghapus suara'),
      },
    )

  return (
    <div className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
      <div className="grid grid-cols-12 items-center gap-2">
        <div className="col-span-1 flex justify-center">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: `${item.color || '#6366f1'}22` }}
          >
            <SpIcon icon={item.icon} color={item.color} />
          </span>
        </div>
        <div className="col-span-11">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-semibold text-stone-700 dark:text-slate-200">{item.name}</span>
            <span className="shrink-0 text-stone-400 dark:text-slate-500">
              {item.level?.level_name ?? '—'} · {item.weighted.toFixed(1)}
            </span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(0, Math.min(100, item.weighted * 10))}%`,
                backgroundColor: item.level?.color || item.color,
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-stone-400 dark:text-slate-500">
            {item.count > 0 ? `Rata-rata ${item.avg.toFixed(1)} · ${item.count} suara` : 'Belum ada suara'}
          </p>
        </div>
      </div>

      {canVote ? (
        <div className="mt-3 border-t border-paper-edge dark:border-slate-700 pt-3">
          <p className="mb-2 text-xs font-medium text-stone-500 dark:text-slate-400">
            Beri nilai (0–10){item.my_vote !== null ? ` · nilaimu ${item.my_vote}` : ''}
          </p>
          <VoteScale value={item.my_vote} color={item.color} onPick={onPick} disabled={busy} />
          {item.my_vote !== null && (
            <button
              onClick={onRemove}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 active:scale-95 disabled:opacity-50"
            >
              {busy ? <Spinner className="h-3 w-3" /> : <Trash2 className="h-3.5 w-3.5" />}
              Hapus suara
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

// Read-only performance-earned trait (auto-computed from app activity).
function PerfCard({ item }: { item: PerfSuperpower }) {
  return (
    <div className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
      <div className="grid grid-cols-12 items-center gap-2">
        <div className="col-span-1 flex justify-center">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: `${item.color || '#6366f1'}22` }}
          >
            <SpIcon icon={item.icon} color={item.color} />
          </span>
        </div>
        <div className="col-span-11">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-semibold text-stone-700 dark:text-slate-200">{item.name}</span>
            <span className="shrink-0 text-stone-400 dark:text-slate-500">
              {item.level?.level_name ?? '—'} · {item.score.toFixed(1)}
            </span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(0, Math.min(100, item.score * 10))}%`,
                backgroundColor: item.level?.color || item.color,
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-stone-400 dark:text-slate-500">{item.detail}</p>
        </div>
      </div>
    </div>
  )
}

// A self-claimed trait, rendered Kinerja-style. Score/level come from the peer
// vote (if any); unvoted traits show an empty bar + "Belum dinilai".
function MineRow({
  name,
  icon,
  color,
  voted,
  canEdit,
  disabled,
  onRemove,
}: {
  name: string
  icon?: string
  color?: string
  voted?: VotedSuperpower
  canEdit: boolean
  disabled: boolean
  onRemove: () => void
}) {
  const score = voted?.weighted ?? 0
  const level = voted?.level ?? null
  return (
    <div className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
      <div className="grid grid-cols-12 items-center gap-2">
        <div className="col-span-1 flex justify-center">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: `${color || '#6366f1'}22` }}
          >
            <SpIcon icon={icon} color={color} />
          </span>
        </div>
        <div className="col-span-11">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-semibold text-stone-700 dark:text-slate-200">{name}</span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-stone-400 dark:text-slate-500">
                {voted ? `${level?.level_name ?? '—'} · ${score.toFixed(1)}` : 'Belum dinilai'}
              </span>
              {canEdit && (
                <button
                  onClick={onRemove}
                  disabled={disabled}
                  aria-label={`Lepas ${name}`}
                  className="text-rose-500 dark:text-rose-400 transition active:scale-90 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(0, Math.min(100, score * 10))}%`,
                backgroundColor: level?.color || color || '#6366f1',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SuperpowerScreen() {
  const { user: routeUser = '' } = useParams<{ user: string }>()
  const { data: boot } = useBoot()
  // Param-less /superpowers (the home shortcut) = the current user's own screen.
  const user = routeUser || boot?.user || ''
  const { data: view, isLoading } = useUserSuperpowers(user)
  const { data: catalog } = useSuperpowers()
  const { data: votable } = useVotableUsers()
  const setMine = useSetMySuperpowers()
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Deep-link support: /superpowers/:user?tab=voted opens straight on that tab.
  const [tab, setTab] = useState<TabKey>(() => {
    const t = searchParams.get('tab')
    return t === 'voted' || t === 'others' || t === 'perf' || t === 'mine' ? t : 'mine'
  })
  // Local claimed set — seeded from the server, toggled optimistically on tap.
  const [claimed, setClaimed] = useState<string[]>([])
  // Traits the viewer added from the picker but hasn't scored yet (no server row).
  const [extraTraits, setExtraTraits] = useState<string[]>([])

  const isSelf = !!boot && boot.user === user

  useEffect(() => {
    if (view) setClaimed(view.mine.map((m) => m.superpower))
  }, [view])

  // "Nilai Rekan" only exists on your own profile; snap back if URL forced it elsewhere.
  useEffect(() => {
    if (tab === 'others' && boot && !isSelf) setTab('mine')
  }, [tab, boot, isSelf])

  const claimedSet = useMemo(() => new Set(claimed), [claimed])

  // Only Voted traits are self-claimable / votable; Performance rows are excluded.
  const voteableCatalog = useMemo(() => (catalog ?? []).filter((c) => c.kind === 'Voted'), [catalog])

  const votedNames = useMemo(() => new Set((view?.voted ?? []).map((v) => v.superpower)), [view])
  const votedByName = useMemo(
    () => new Map((view?.voted ?? []).map((v) => [v.superpower, v] as const)),
    [view],
  )

  // Metadata lookups for "mine" rows (icon/color/name), catalog first, server fallback.
  const catByName = useMemo(() => new Map(voteableCatalog.map((c) => [c.name, c] as const)), [voteableCatalog])
  const mineByName = useMemo(
    () => new Map((view?.mine ?? []).map((m) => [m.superpower, m] as const)),
    [view],
  )
  const mineAddOpts = useMemo(
    () =>
      voteableCatalog
        .filter((c) => !claimedSet.has(c.name))
        .map((c) => ({ value: c.name, label: c.superpower_name })),
    [voteableCatalog, claimedSet],
  )

  // Pseudo-cards for picked-but-unvoted traits (drop any that landed in `voted`).
  const extraCards = useMemo<VotedSuperpower[]>(() => {
    return extraTraits
      .filter((n) => !votedNames.has(n))
      .map((n) => {
        const c = voteableCatalog.find((x) => x.name === n)
        return {
          superpower: n,
          name: c?.superpower_name ?? n,
          icon: c?.icon ?? '',
          color: c?.color ?? '',
          category: c?.category ?? '',
          avg: 0,
          count: 0,
          weighted: 0,
          level: null,
          my_vote: null,
        }
      })
  }, [extraTraits, votedNames, voteableCatalog])

  const addOpts = useMemo(
    () =>
      voteableCatalog
        .filter((c) => !votedNames.has(c.name) && !extraTraits.includes(c.name))
        .map((c) => ({ value: c.name, label: c.superpower_name })),
    [voteableCatalog, votedNames, extraTraits],
  )

  if (isLoading && !view) {
    return (
      <DetailScreen title="Superpower">
        <FullScreenLoader />
      </DetailScreen>
    )
  }
  if (!view) {
    return (
      <DetailScreen title="Superpower">
        <EmptyState icon={Sparkles} title="Tidak tersedia" subtitle="Data superpower tidak dapat dimuat." />
      </DetailScreen>
    )
  }

  const toggleClaim = (name: string) => {
    if (!view.can_edit_mine || setMine.isPending) return
    const next = claimedSet.has(name) ? claimed.filter((n) => n !== name) : [...claimed, name]
    setClaimed(next)
    setMine.mutate(
      { user, superpowers: next },
      {
        onSuccess: () => toast('success', 'Superpower tersimpan'),
        onError: (e) => {
          toast('error', e instanceof Error ? e.message : 'Gagal menyimpan')
          setClaimed(view.mine.map((m) => m.superpower)) // revert to server truth
        },
      },
    )
  }

  // "Mine" rows follow the Kinerja layout, ordered by peer-vote score (unvoted last).
  const mineIds = [...claimed].sort(
    (a, b) => (votedByName.get(b)?.weighted ?? 0) - (votedByName.get(a)?.weighted ?? 0),
  )

  return (
    <DetailScreen title={isSelf ? 'Superpower Saya' : 'Superpower'}>
      {/* Intro — one-time context on what a superpower is. */}
      <div className="mb-4 rounded-2xl bg-paper-line/60 dark:bg-slate-800/60 px-4 py-3 text-xs leading-relaxed text-stone-500 dark:text-slate-400">
        Superpower adalah kekuatan &amp; keahlian utamamu — dipakai untuk menentukan keterlibatanmu dalam
        tugas dan kontribusi tim.
      </div>

      {/* Header — signature + achievement */}
      <div className="mb-4 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
        <p className="text-base font-bold text-stone-800 dark:text-slate-100">{view.user_name}</p>
        {view.user_name !== user && (
          <p className="text-xs text-stone-400 dark:text-slate-500">{user}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {view.signature ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 dark:bg-brand-500/15 px-3 py-1 text-sm font-bold text-brand-700 dark:text-brand-300">
              <Star className="h-4 w-4" />
              {view.signature.name}
              <LevelBadge level={view.signature.level} />
            </span>
          ) : (
            <span className="text-sm text-stone-400 dark:text-slate-500">Belum ada superpower unggulan</span>
          )}
          {view.achievement && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
              <Zap className="h-3.5 w-3.5" />
              Superpowered
            </span>
          )}
        </div>
      </div>

      <Segmented
        scroll={isSelf}
        options={[
          { value: 'mine', label: 'Superpower Saya' },
          { value: 'voted', label: 'Dinilai Rekan' },
          ...(isSelf ? [{ value: 'others' as TabKey, label: 'Nilai Rekan' }] : []),
          { value: 'perf', label: 'Kinerja' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="mt-4">
        {tab === 'mine' && (
          <div className="space-y-3">
            {view.can_edit_mine && (
              <div className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
                  Tambah superpower
                </p>
                <SearchableSelect
                  value=""
                  onChange={(v) => v && toggleClaim(v)}
                  options={mineAddOpts}
                  placeholder={
                    mineAddOpts.length ? 'Pilih superpower…' : 'Semua superpower sudah dipilih'
                  }
                />
              </div>
            )}

            {claimed.length === 0 ? (
              view.can_edit_mine ? (
                <p className="text-sm text-stone-400 dark:text-slate-500">
                  Belum ada superpower. Pilih dari daftar di atas.
                </p>
              ) : (
                <EmptyState
                  icon={Sparkles}
                  title="Belum ada superpower"
                  subtitle="Pengguna ini belum memilih superpower."
                />
              )
            ) : (
              mineIds.map((id) => {
                const cat = catByName.get(id)
                const m = mineByName.get(id)
                return (
                  <MineRow
                    key={id}
                    name={cat?.superpower_name ?? m?.name ?? id}
                    icon={cat?.icon ?? m?.icon}
                    color={cat?.color ?? m?.color}
                    voted={votedByName.get(id)}
                    canEdit={view.can_edit_mine}
                    disabled={setMine.isPending}
                    onRemove={() => toggleClaim(id)}
                  />
                )
              })
            )}
          </div>
        )}

        {tab === 'voted' && (
          <div className="space-y-3">
            {!isSelf && addOpts.length > 0 && (
              <div className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
                  Nilai superpower lain
                </p>
                <SearchableSelect
                  value=""
                  onChange={(v) => v && setExtraTraits((prev) => [...prev, v])}
                  options={addOpts}
                  placeholder="Tambah superpower untuk dinilai…"
                />
              </div>
            )}

            {view.voted.length === 0 && extraCards.length === 0 ? (
              <EmptyState
                icon={Star}
                title="Belum ada penilaian"
                subtitle={isSelf ? 'Rekan kerja belum menilai superpowermu.' : 'Jadilah yang pertama menilai.'}
              />
            ) : (
              [...view.voted, ...extraCards]
                .sort((a, b) => b.weighted - a.weighted || a.name.localeCompare(b.name))
                .map((item) => (
                  <VotedCard key={item.superpower} item={item} ratee={user} canVote={!isSelf} />
                ))
            )}
          </div>
        )}

        {tab === 'others' && isSelf && (
          <div className="space-y-3">
            <p className="text-xs text-stone-400 dark:text-slate-500">
              Ketuk untuk menilai superpower rekanmu.
            </p>
            {(votable ?? []).length === 0 ? (
              <EmptyState
                icon={Star}
                title="Belum ada rekan"
                subtitle="Belum ada rekan yang bisa dinilai."
              />
            ) : (
              (votable ?? []).map((u) => (
                <button
                  key={u.user}
                  onClick={() => navigate(`/superpowers/${u.user}?tab=voted`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3 text-left shadow-card transition active:scale-[0.99]"
                >
                  <Avatar name={u.user_name} image={u.user_image} size={40} />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-700 dark:text-slate-200">
                    {u.user_name}
                  </p>
                  {u.voted && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <Check className="h-3.5 w-3.5" />
                      Sudah dinilai{u.vote_count > 0 ? ` · ${u.vote_count}` : ''}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {tab === 'perf' && (
          <div className="space-y-3">
            <p className="text-xs text-stone-400 dark:text-slate-500">
              Diberikan otomatis dari aktivitasmu di aplikasi.
            </p>
            {view.performance.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="Belum ada kinerja"
                subtitle="Superpower kinerja akan muncul dari aktivitasmu."
              />
            ) : (
              [...view.performance]
                .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
                .map((item) => <PerfCard key={item.superpower} item={item} />)
            )}
          </div>
        )}
      </div>
    </DetailScreen>
  )
}

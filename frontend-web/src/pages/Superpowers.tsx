import { useMemo, useState, type ComponentType, type CSSProperties } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  ArrowLeft, Sparkles, Award, Zap, X,
  Telescope, Puzzle, TrendingUp, Megaphone, Target, Handshake, Crown,
  MessageCircle, CheckCircle, BarChart3, Users, Shuffle, HeartHandshake,
  DollarSign, Lightbulb, Settings, BookOpen, UsersRound, Scale, Sprout, Leaf, Flame, Star,
} from 'lucide-react'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { Page } from '@web/components/Page'
import {
  useBoot, useSuperpowers, useUserSuperpowers, useVotableUsers,
  useSetMySuperpowers, useCastVote, useRemoveVote,
} from '@/hooks/useData'
import type { SuperpowerLevel, VotedSuperpower } from '@/lib/types'

// ── Robust trait icon: seeded values are kebab-case lucide names; admins may type
// an emoji or an unknown name. Known name → lucide component; else render the raw
// string as text (emoji), never crash. Curated map keeps lucide tree-shakeable.
const LUCIDE: Record<string, ComponentType<{ className?: string; style?: CSSProperties }>> = {
  telescope: Telescope, puzzle: Puzzle, 'trending-up': TrendingUp, megaphone: Megaphone,
  target: Target, handshake: Handshake, crown: Crown, 'message-circle': MessageCircle,
  'check-circle': CheckCircle, sparkles: Sparkles, 'bar-chart-3': BarChart3, users: Users,
  shuffle: Shuffle, 'heart-handshake': HeartHandshake, 'dollar-sign': DollarSign,
  lightbulb: Lightbulb, settings: Settings, 'book-open': BookOpen, 'users-round': UsersRound,
  scale: Scale, sprout: Sprout, leaf: Leaf, flame: Flame, star: Star,
}

export function SPIcon({ icon, className, color }: { icon?: string; className?: string; color?: string }) {
  const Cmp = LUCIDE[(icon || '').trim().toLowerCase()]
  const style = color ? { color } : undefined
  if (Cmp) return <Cmp className={className} style={style} />
  return <span className={clsx('leading-none', className)} style={style}>{icon || '⭐'}</span>
}

// 6-digit hex → same hex at ~12% alpha for a soft chip wash. Non-hex → no wash.
export const hexBg = (color?: string) =>
  color && /^#[0-9a-f]{6}$/i.test(color) ? color + '1f' : undefined

export function LevelBadge({ level }: { level: SuperpowerLevel | null }) {
  if (!level)
    return <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">Belum ada level</span>
  return (
    <span
      style={{ color: level.color, borderColor: level.color, backgroundColor: hexBg(level.color) }}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
    >
      <SPIcon icon={level.icon} className="h-3.5 w-3.5" /> {level.level_name}
    </span>
  )
}

function VotePills({ value, onPick, disabled }: { value: number | null; onPick: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: 11 }).map((_, n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onPick(n)}
          className={clsx(
            'h-8 w-8 rounded-lg text-xs font-semibold transition disabled:opacity-50',
            value === n
              ? 'bg-brand-600 text-white'
              : 'border border-line bg-canvas text-muted hover:bg-hover/[0.06]',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

type Tab = 'mine' | 'voted' | 'perf' | 'others'

export default function Superpowers() {
  const { user: routeUser = '' } = useParams<{ user: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  // Param-less /superpowers (the home shortcut) = the current user's own screen.
  const user = routeUser || boot?.user || ''
  const isSelf = !!boot && user === boot.user

  const view = useUserSuperpowers(user)
  const { data: catalog = [] } = useSuperpowers()
  const { data: votable = [] } = useVotableUsers()
  const setMine = useSetMySuperpowers()
  const cast = useCastVote()
  const removeVote = useRemoveVote()

  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get('tab')
    return t === 'mine' || t === 'voted' || t === 'perf' || t === 'others' ? t : 'mine'
  })

  const v = view.data

  const displayName = v?.user_name || user

  // "Dinilai Rekan" always lists the WHOLE votable catalog — each trait carries
  // its aggregate if it has votes, else a zero row so it's still ratable.
  const cards = useMemo<VotedSuperpower[]>(() => {
    if (!v) return []
    const byName: Record<string, VotedSuperpower> = {}
    v.voted.forEach((x) => { byName[x.superpower] = x })
    return catalog
      .filter((c) => c.kind === 'Voted')
      .map(
        (c) =>
          byName[c.name] ?? {
            superpower: c.name, name: c.superpower_name, icon: c.icon, color: c.color,
            category: c.category, avg: 0, count: 0, weighted: 0, level: null, my_vote: null,
          },
      )
  }, [v, catalog])

  // Claimed chips show their peer-voted level/score; index voted rows by trait name.
  const votedByName = useMemo(() => {
    const m: Record<string, VotedSuperpower> = {}
    v?.voted.forEach((x) => { m[x.superpower] = x })
    return m
  }, [v])

  // Only self-claimed/peer-voted traits are claimable as chips or votable.
  const votedCatalog = useMemo(() => catalog.filter((c) => c.kind === 'Voted'), [catalog])

  if (view.isLoading)
    return <div className="flex justify-center py-20"><Spinner /></div>
  if (view.isError || !v)
    return <ErrorState onRetry={() => view.refetch()} />

  const saveMine = (next: string[]) =>
    setMine.mutate({ user, superpowers: next }, {
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menyimpan'),
    })
  const doCast = (superpower: string, score: number) =>
    cast.mutate({ ratee: user, superpower, score }, {
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal memberi nilai'),
    })
  const doRemove = (superpower: string) =>
    removeVote.mutate({ ratee: user, superpower }, {
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menghapus suara'),
    })

  const claimedIds = v.mine.map((m) => m.superpower)
  const claimable = votedCatalog
    .filter((c) => !claimedIds.includes(c.name))
    .map((c) => ({ value: c.name, label: c.superpower_name }))

  const tabDefs: [Tab, string][] = [
    ['mine', 'Superpower Saya'],
    ['voted', 'Dinilai Rekan'],
    ...(isSelf ? ([['others', 'Nilai Rekan']] as [Tab, string][]) : []),
    ['perf', 'Kinerja'],
  ]

  return (
    <Page className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Kembali
      </button>

      {/* Hero: identity + signature superpower + achievement */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-violet-600 to-brand-700 p-6 text-white shadow-card">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="shrink-0 rounded-full ring-4 ring-white/25">
            <Avatar name={displayName} image={v?.user_image ?? undefined} config={v?.avatar_config} size={72} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-white/70">Superpowers</div>
            <div className="truncate text-2xl font-bold leading-tight">{displayName}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {v.signature && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm"
                  title={`Superpower utama · ${v.signature.level?.level_name ?? 'belum berlevel'}`}
                >
                  <SPIcon icon={v.signature.icon} className="h-3.5 w-3.5" />
                  {v.signature.name}
                  {v.signature.level && <span className="opacity-80">· {v.signature.level.level_name}</span>}
                </span>
              )}
              {v.achievement && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-1 text-xs font-bold text-amber-950">
                  <Award className="h-3.5 w-3.5" /> Superpowered
                </span>
              )}
              {!v.signature && !v.achievement && (
                <span className="text-xs text-white/70">Belum ada penilaian rekan.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Intro explanation */}
      <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        Superpower adalah kekuatan & keahlian utamamu — dipakai untuk menentukan keterlibatanmu dalam tugas dan kontribusi tim.
      </div>

      {/* Segmented tabs */}
      <div className="mt-5 inline-flex rounded-xl border border-line bg-surface p-1">
        {tabDefs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={clsx(
              'rounded-lg px-4 py-1.5 text-sm font-semibold transition',
              tab === k ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'mine' && (
        <div className="mt-4 space-y-3">
          {v.can_edit_mine && (
            <p className="text-xs text-muted">
              Pilih superpower yang kamu klaim sendiri. Rekan menilai secara terpisah.
            </p>
          )}
          {v.mine.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Belum ada superpower"
              subtitle={v.can_edit_mine ? 'Tambahkan superpower pertamamu di bawah.' : 'Pengguna ini belum memilih superpowernya.'}
            />
          ) : (
            [...v.mine]
              .sort((a, b) => (votedByName[b.superpower]?.weighted ?? 0) - (votedByName[a.superpower]?.weighted ?? 0) || a.name.localeCompare(b.name))
              .map((m) => {
                const vv = votedByName[m.superpower]
                const scored = !!vv && vv.count > 0
                return (
                  <div key={m.superpower} className="rounded-2xl bg-surface p-4 shadow-card">
                    <div className="grid grid-cols-12 items-center gap-3">
                      <div className="col-span-1 flex justify-center">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: hexBg(m.color) }}>
                          <SPIcon icon={m.icon} color={m.color} className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="col-span-11">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-semibold text-ink">{m.name}</span>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-muted">{scored ? `${vv.level?.level_name ?? '—'} · ${vv.weighted.toFixed(1)}` : 'Belum dinilai'}</span>
                            {v.can_edit_mine && (
                              <button
                                type="button"
                                onClick={() => saveMine(claimedIds.filter((x) => x !== m.superpower))}
                                disabled={setMine.isPending}
                                aria-label="Hapus superpower"
                                className="text-muted transition hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-canvas">
                          <div className="h-full rounded-full transition-all" style={{ width: `${scored ? Math.max(0, Math.min(100, vv.weighted * 10)) : 0}%`, backgroundColor: vv?.level?.color || m.color }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
          )}
          {v.can_edit_mine && (
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="mb-1 text-sm font-semibold text-ink">Tambah superpower</div>
              <SearchableSelect
                value=""
                onChange={(val) => val && saveMine([...claimedIds, val])}
                options={claimable}
                placeholder="Pilih superpower yang kamu klaim…"
              />
            </div>
          )}
        </div>
      )}

      {tab === 'voted' && (
        <div className="mt-4 space-y-4">
          {cards.length === 0 ? (
            <EmptyState icon={Zap} title="Belum dinilai" subtitle={isSelf ? 'Rekanmu belum memberi penilaian.' : 'Jadilah yang pertama menilai.'} />
          ) : (
            [...cards]
              .sort((a, b) => b.weighted - a.weighted || a.name.localeCompare(b.name))
              .map((c) => (
              <div key={c.superpower} className="space-y-3 rounded-2xl bg-surface p-4 shadow-card">
                <div className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-1 flex justify-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: hexBg(c.color) }}>
                      <SPIcon icon={c.icon} color={c.color} className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="col-span-11">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-semibold text-ink">{c.name}</span>
                      <span className="shrink-0 text-muted">{c.level?.level_name ?? '—'} · {c.weighted.toFixed(1)}</span>
                    </div>
                    <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, c.weighted * 10))}%`, backgroundColor: c.level?.color || c.color }} />
                    </div>
                    <div className="mt-1 text-xs text-muted">{c.count} suara{c.count > 0 ? ` · rata-rata ${c.avg.toFixed(1)}` : ''}</div>
                  </div>
                </div>
                {!isSelf && (
                  <div className="space-y-2 border-t border-line pt-3">
                    <div className="text-xs font-medium text-muted">Nilai kamu (0–10)</div>
                    <VotePills value={c.my_vote} onPick={(n) => doCast(c.superpower, n)} disabled={cast.isPending} />
                    {c.my_vote != null && (
                      <button
                        type="button"
                        onClick={() => doRemove(c.superpower)}
                        disabled={removeVote.isPending}
                        className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50 dark:text-rose-400"
                      >
                        Hapus suara
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'others' && isSelf && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted">Klik untuk menilai superpower rekanmu.</p>
          {votable.length === 0 ? (
            <EmptyState icon={Users} title="Belum ada rekan" subtitle="Belum ada rekan untuk dinilai." />
          ) : (
            votable.map((p) => (
              <button
                key={p.user}
                type="button"
                onClick={() => navigate(`/superpowers/${encodeURIComponent(p.user)}?tab=voted`)}
                className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-card transition hover:bg-hover/[0.04]"
              >
                <Avatar name={p.user_name || p.user} image={p.user_image ?? undefined} config={p.avatar_config} size={40} />
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.user_name || p.user}</span>
                {p.voted && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle className="h-3.5 w-3.5" /> Sudah dinilai{p.vote_count > 0 ? ` · ${p.vote_count}` : ''}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {tab === 'perf' && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted">Diberikan otomatis dari aktivitasmu di aplikasi.</p>
          {v.performance.length === 0 ? (
            <EmptyState icon={TrendingUp} title="Belum ada kinerja" subtitle="Belum ada data aktivitas untuk dihitung." />
          ) : (
            <div className="space-y-3">
              {[...v.performance]
                .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
                .map((p) => (
                <div key={p.superpower} className="rounded-2xl bg-surface p-4 shadow-card">
                  <div className="grid grid-cols-12 items-center gap-3">
                    <div className="col-span-1 flex justify-center">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: hexBg(p.color) }}>
                        <SPIcon icon={p.icon} color={p.color} className="h-4 w-4" />
                      </span>
                    </div>
                    <div className="col-span-11">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold text-ink">{p.name}</span>
                        <span className="shrink-0 text-muted">{p.level?.level_name ?? '—'} · {p.score.toFixed(1)}</span>
                      </div>
                      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-canvas">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, p.score * 10))}%`, backgroundColor: p.level?.color || p.color }} />
                      </div>
                      <div className="mt-1 text-xs text-muted">{p.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Page>
  )
}

import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  ArrowLeft, Sparkles, Award, Zap,
  Telescope, Puzzle, TrendingUp, Megaphone, Target, Handshake, Crown,
  MessageCircle, CheckCircle, BarChart3, Users, Shuffle, HeartHandshake,
  DollarSign, Lightbulb, Settings, BookOpen, UsersRound, Scale, Sprout, Leaf, Flame, Star,
} from 'lucide-react'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { Page } from '@web/components/Page'
import {
  useBoot, useSuperpowers, useUserSuperpowers,
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
  const setMine = useSetMySuperpowers()
  const cast = useCastVote()
  const removeVote = useRemoveVote()

  const [tab, setTab] = useState<'mine' | 'voted'>('mine')
  const [mineSel, setMineSel] = useState<string[]>([])
  const [extra, setExtra] = useState<string[]>([]) // traits added to vote on but not yet scored

  const v = view.data
  useEffect(() => {
    if (v) setMineSel(v.mine.map((m) => m.superpower))
  }, [v])

  const displayName = v?.user_name || user

  // Voted cards + any freshly-added traits the viewer hasn't scored yet.
  const cards = useMemo<VotedSuperpower[]>(() => {
    if (!v) return []
    const have = new Set(v.voted.map((x) => x.superpower))
    const extraCards = extra
      .filter((n) => !have.has(n))
      .map((n) => catalog.find((c) => c.name === n))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({
        superpower: c.name, name: c.superpower_name, icon: c.icon, color: c.color,
        category: c.category, avg: 0, count: 0, weighted: 0, level: null, my_vote: null,
      }))
    return [...v.voted, ...extraCards]
  }, [v, extra, catalog])

  const addable = useMemo(() => {
    if (!v) return []
    const shown = new Set([...v.voted.map((x) => x.superpower), ...extra])
    return catalog.filter((c) => !shown.has(c.name)).map((c) => ({ value: c.name, label: c.superpower_name }))
  }, [v, extra, catalog])

  if (view.isLoading)
    return <div className="flex justify-center py-20"><Spinner /></div>
  if (view.isError || !v)
    return <ErrorState onRetry={() => view.refetch()} />

  const saveMine = (next: string[]) => {
    setMineSel(next)
    setMine.mutate({ user, superpowers: next }, {
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menyimpan'),
    })
  }
  const doCast = (superpower: string, score: number) =>
    cast.mutate({ ratee: user, superpower, score }, {
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal memberi nilai'),
    })
  const doRemove = (superpower: string) =>
    removeVote.mutate({ ratee: user, superpower }, {
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menghapus suara'),
    })

  const catOptions = catalog.map((c) => ({ value: c.name, label: c.superpower_name }))

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
            <Avatar name={displayName} image={v?.user_image ?? undefined} size={72} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-white/70">Superpowers</div>
            <div className="truncate text-2xl font-bold leading-tight">{displayName}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {v.signature && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm"
                  title={`Kekuatan utama · ${v.signature.level?.level_name ?? 'belum berlevel'}`}
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

      {/* Segmented tabs */}
      <div className="mt-5 inline-flex rounded-xl border border-line bg-surface p-1">
        {([['mine', 'Kekuatan Saya'], ['voted', 'Dinilai Rekan']] as const).map(([k, label]) => (
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

      {tab === 'mine' ? (
        <div className="mt-4 space-y-4">
          {v.mine.length === 0 && !v.can_edit_mine && (
            <EmptyState icon={Sparkles} title="Belum ada kekuatan" subtitle="Pengguna ini belum memilih kekuatannya." />
          )}
          {v.mine.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {v.mine.map((m) => (
                <span
                  key={m.superpower}
                  style={{ color: m.color, borderColor: m.color, backgroundColor: hexBg(m.color) }}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold"
                >
                  <SPIcon icon={m.icon} className="h-4 w-4" /> {m.name}
                </span>
              ))}
            </div>
          )}
          {v.can_edit_mine && (
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <div className="mb-1 text-sm font-semibold text-ink">Pilih kekuatanmu</div>
              <p className="mb-2 text-xs text-muted">Kekuatan yang kamu klaim sendiri. Rekan menilai secara terpisah.</p>
              <MultiSelectSearch
                options={catOptions}
                value={mineSel}
                onChange={saveMine}
                placeholder="Tambah kekuatan…"
                emptyText="Belum ada katalog"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {!isSelf && (
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <div className="mb-1 text-sm font-semibold text-ink">Nilai kekuatan lain</div>
              <SearchableSelect
                value=""
                onChange={(val) => val && setExtra((prev) => [...prev, val])}
                options={addable}
                placeholder="Pilih kekuatan untuk dinilai…"
              />
            </div>
          )}
          {cards.length === 0 ? (
            <EmptyState icon={Zap} title="Belum dinilai" subtitle={isSelf ? 'Rekanmu belum memberi penilaian.' : 'Jadilah yang pertama menilai.'} />
          ) : (
            cards.map((c) => (
              <div key={c.superpower} className="space-y-3 rounded-2xl bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: hexBg(c.color) }}>
                      <SPIcon icon={c.icon} color={c.color} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">{c.name}</div>
                      <div className="text-xs text-muted">{c.category}</div>
                    </div>
                  </div>
                  <LevelBadge level={c.level} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold tabular-nums text-ink">{c.count > 0 ? c.avg.toFixed(1) : '—'}</span>
                  <span className="text-xs text-muted">{c.count} suara</span>
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
    </Page>
  )
}

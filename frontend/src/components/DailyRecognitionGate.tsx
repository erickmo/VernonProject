import { useState } from 'react'
import clsx from 'clsx'
import { Sparkles, Send, X } from 'lucide-react'
import { Avatar, Spinner } from './ui'
import { SPIcon } from '../lib/spIcon'
import { useSuperpowers, useCastVotes } from '../hooks/useData'
import type { RecognitionGate } from '../lib/types'

// Blocking daily recognition gate: shown on app open when the session user still owes a
// superpower vote for a colleague. No skip/dismiss (unless `onClose` is passed — used only
// by the System-Manager testing screen). Voting UI mirrors the main vote screen: EVERY
// votable superpower on its own line with its own 0–10 scale. Submitting casts every trait
// the user scored; on success useCastVotes invalidates the gate so the parent unmounts it.
// Shared by both frontends (web imports via @/components, like SuperpowerGate).

// Floating superpower emblems orbiting the avatar — hype, no asset needed.
const ORBIT = [
  { e: '⚡', cls: 'left-2 top-4', d: '0s' },
  { e: '🔥', cls: 'right-3 top-8', d: '0.4s' },
  { e: '🚀', cls: 'left-6 bottom-6', d: '0.8s' },
  { e: '💪', cls: 'right-5 bottom-4', d: '1.2s' },
  { e: '🎯', cls: 'left-0 top-1/2', d: '1.6s' },
  { e: '🧠', cls: 'right-0 top-1/2', d: '0.6s' },
]

// 0–10 selector (11 wrapping buttons) — mirrors VoteScale on the main vote screen.
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
    <div className="grid grid-cols-11 gap-1">
      {Array.from({ length: 11 }, (_, n) => {
        const active = value === n
        return (
          <button
            key={n}
            disabled={disabled}
            onClick={() => onPick(n)}
            className={clsx(
              'h-8 w-full rounded-lg text-sm font-semibold transition active:scale-90 disabled:opacity-50',
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

export default function DailyRecognitionGate({
  gate,
  onClose,
}: {
  gate: RecognitionGate
  onClose?: () => void
}) {
  // gate.owed is true and gate.assignee is non-null when this renders (contract).
  const assignee = gate.assignee!
  const { data: catalog } = useSuperpowers()
  const cast = useCastVotes()

  // superpower name -> chosen 0–10 score (a trait is "scored" once it's a key here).
  const [scores, setScores] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

  // Only Voted traits are castable — Performance ones are auto-computed, not votable.
  const traits = (catalog ?? []).filter((c) => (c.kind || 'Voted') !== 'Performance')
  const picked = Object.entries(scores)
  const recognized = gate.total - gate.remaining
  // Every superpower must be scored — none left out — before the recognition counts.
  const allRated = traits.length > 0 && picked.length === traits.length

  const submit = () => {
    if (!allRated || cast.isPending) return
    setError(null)
    cast.mutate(
      { ratee: assignee.user, votes: picked.map(([superpower, score]) => ({ superpower, score })) },
      {
        onSuccess: () => onClose?.(),
        onError: (e) => setError(e instanceof Error ? e.message : 'Gagal mengirim. Coba lagi.'),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-brand-600 via-brand-500 to-indigo-700 animate-fade-in">
      {/* soft glow blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />

      {onClose && (
        <button
          onClick={onClose}
          aria-label="Tutup"
          className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white transition active:scale-90 hover:bg-white/30"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      <div className="relative flex min-h-full flex-col items-center px-6 py-10 text-center">
        {/* animated hero: the colleague's avatar ringed by floating emblems */}
        <div className="relative mb-5 flex h-48 w-48 items-center justify-center animate-pop">
          <div className="absolute inset-6 rounded-full bg-white/25 blur-xl animate-float" />
          <div className="rounded-full ring-4 ring-white/70 shadow-2xl">
            <Avatar name={assignee.user_name} config={assignee.avatar_config} size={112} />
          </div>
          {ORBIT.map((o) => (
            <span
              key={o.e}
              className={`absolute ${o.cls} text-3xl drop-shadow-lg animate-float`}
              style={{ animationDelay: o.d }}
            >
              {o.e}
            </span>
          ))}
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          <Sparkles className="h-3.5 w-3.5" /> Kenali rekanmu
        </div>

        <h1 className="mt-3 max-w-sm text-2xl font-extrabold leading-tight text-white drop-shadow">
          ⚡ Kenali kekuatan rekanmu!
        </h1>
        <p className="mt-1 text-lg font-bold text-white">{assignee.user_name}</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/90">
          Nilai <b>semua</b> superpower di bawah untuk mengenali {assignee.user_name} — tidak ada yang boleh dilewati.
        </p>

        {/* Anonymity + purpose */}
        <div className="mt-3 max-w-sm rounded-2xl bg-white/15 px-4 py-3 text-xs leading-relaxed text-white/90 backdrop-blur-sm">
          Penilaian bersifat <b>anonim</b>. Tujuannya membantu setiap orang mengenali &amp; mengembangkan
          kekuatannya — hasil hanya bisa dilihat oleh pemiliknya. Penilaian diperbarui tiap kuartal.
        </div>

        <p className="mt-2 text-sm font-semibold text-white/80">
          Kamu sudah mengenali {recognized} dari {gate.total} rekan kuartal ini
          {traits.length > 0 ? ` · ${picked.length}/${traits.length} superpower dinilai` : ''}.
        </p>

        {/* per-superpower rows, each with its own 0–10 scale */}
        <div className="mt-5 w-full max-w-md space-y-2.5 text-left">
          {traits.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl bg-paper-card dark:bg-slate-900 p-3.5 shadow-lg"
            >
              <div className="mb-1 flex items-center gap-2">
                <SPIcon icon={t.icon} color={t.color} className="h-5 w-5 shrink-0" />
                <span className="text-sm font-bold text-stone-800 dark:text-slate-100">
                  {t.superpower_name}
                </span>
                {scores[t.name] !== undefined && (
                  <span
                    className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold text-white"
                    style={{ backgroundColor: t.color || '#6366f1' }}
                  >
                    {scores[t.name]}
                  </span>
                )}
              </div>
              {t.description && (
                <p className="mb-2 text-xs leading-snug text-stone-500 dark:text-slate-400">
                  {t.description}
                </p>
              )}
              <VoteScale
                value={scores[t.name] ?? null}
                color={t.color}
                disabled={cast.isPending}
                onPick={(n) => setScores((s) => ({ ...s, [t.name]: n }))}
              />
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-3 text-sm font-medium text-rose-100 bg-rose-600/40 rounded-lg px-3 py-1.5">
            {error}
          </p>
        )}

        <div className="sticky bottom-0 mt-5 w-full max-w-md pb-2">
          <button
            onClick={submit}
            disabled={!allRated || cast.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-xl transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400 enabled:hover:scale-[1.02]"
          >
            {cast.isPending ? (
              <>
                <Spinner className="h-5 w-5" />
                Mengirim…
              </>
            ) : allRated ? (
              <>
                <Send className="h-5 w-5" />
                Kirim
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                Nilai semua ({picked.length}/{traits.length || '…'})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

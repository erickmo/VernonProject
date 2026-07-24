import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Brain, X, Send, Sparkles } from 'lucide-react'
import { Spinner } from './ui'
import { mobileApi } from '../lib/api'
import { useDiscReminder, keys } from '../hooks/useData'

// Dismissible reminder to complete the DISC + personality (Big Five) tests. NOT a hard
// gate: [Isi Sekarang] opens the test flow, [Nanti] stamps localStorage and the nudge
// returns after N hours. Shared by both frontends (web imports via @/components, like
// DailyRecognitionGate). Per-device throttle in localStorage.
// ponytail: per-device throttle; move server-side only if "nudge must sync across devices" comes up.

const DISMISS_KEY = 'disc_reminder_dismissed_at'

export default function DiscReminderPopup() {
  const { data } = useDiscReminder()
  const [phase, setPhase] = useState<'nudge' | 'test' | null>(null)
  const [done, setDone] = useState(false) // acted this session → don't re-nudge

  useEffect(() => {
    if (!data || done || phase) return
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    if (data.owed && Date.now() - dismissedAt > (data.hours || 24) * 3600 * 1000) {
      setPhase('nudge')
    }
  }, [data, done, phase])

  const later = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setPhase(null)
    setDone(true)
  }

  if (phase === 'nudge') return <Nudge onTake={() => setPhase('test')} onLater={later} />
  if (phase === 'test')
    return (
      <TestFlow
        onClose={() => {
          setPhase(null)
          setDone(true)
        }}
      />
    )
  return null
}

function Nudge({ onTake, onLater }: { onTake: () => void; onLater: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-slate-900">
        <button
          onClick={onLater}
          aria-label="Tutup"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-400 transition active:scale-90 hover:bg-stone-100 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
          <Brain className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-extrabold text-stone-800 dark:text-slate-100">
          Lengkapi tes DISC &amp; kepribadian kamu
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-slate-400">
          Kenali gaya kerja &amp; kekuatanmu. Hanya butuh beberapa menit, dan hasilnya bisa kamu lihat kapan
          saja di profilmu.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={onTake}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition active:scale-95 hover:scale-[1.02]"
          >
            <Sparkles className="h-4 w-4" /> Isi Sekarang
          </button>
          <button
            onClick={onLater}
            className="w-full rounded-2xl px-6 py-2.5 text-sm font-semibold text-stone-500 transition active:scale-95 dark:text-slate-400"
          >
            Nanti
          </button>
        </div>
      </div>
    </div>
  )
}

const LIKERT = [
  { v: 1, label: 'Sangat Tidak Setuju' },
  { v: 2, label: 'Tidak Setuju' },
  { v: 3, label: 'Netral' },
  { v: 4, label: 'Setuju' },
  { v: 5, label: 'Sangat Setuju' },
]

function TestFlow({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: q, isLoading, isError } = useQuery({
    queryKey: ['disc-questions'],
    queryFn: () => mobileApi.getDiscQuestions(),
  })

  // DISC answers: item_id -> {most, least} (word indices 0-3). Big Five: item_id -> 1..5.
  const [disc, setDisc] = useState<Record<string, { most?: number; least?: number }>>({})
  const [bf, setBf] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showDisc = !!q && !q.disc_done
  const showBf = !!q && !q.personality_done
  const discItems = showDisc ? q!.disc : []
  const bfItems = showBf ? q!.personality : []

  const total = discItems.length + bfItems.length
  const discDoneCount = discItems.filter(
    (it) => disc[it.id]?.most !== undefined && disc[it.id]?.least !== undefined,
  ).length
  const bfDoneCount = bfItems.filter((it) => bf[it.id] !== undefined).length
  const answered = discDoneCount + bfDoneCount
  const allAnswered = total > 0 && answered === total

  const pickDisc = (id: string, kind: 'most' | 'least', idx: number) =>
    setDisc((s) => ({ ...s, [id]: { ...s[id], [kind]: idx } }))

  const submit = async () => {
    if (!allAnswered || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      // Coerce to the {most, least} shape the endpoint expects (both are set once allAnswered).
      const discPayload: Record<string, { most: number; least: number }> = {}
      for (const [id, a] of Object.entries(disc)) {
        if (a.most !== undefined && a.least !== undefined) discPayload[id] = { most: a.most, least: a.least }
      }
      await mobileApi.submitDiscTest(discPayload, bf)
      qc.invalidateQueries({ queryKey: keys.discReminder })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengirim. Coba lagi.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-paper dark:bg-slate-950 animate-fade-in">
      {/* header + progress */}
      <div className="sticky top-0 z-10 border-b border-paper-edge bg-paper/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
            <Brain className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-stone-800 dark:text-slate-100">Tes DISC &amp; Kepribadian</p>
            <p className="text-xs text-stone-400 dark:text-slate-500">
              {total > 0 ? `${answered}/${total} terjawab` : 'Memuat…'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-400 transition active:scale-90 hover:bg-stone-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {total > 0 && (
          <div className="mx-auto mt-2 h-1.5 w-full max-w-2xl overflow-hidden rounded-full bg-paper-line dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${(answered / total) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {isLoading && <Spinner className="mx-auto mt-10 h-6 w-6 text-stone-400" />}
          {isError && (
            <p className="mt-10 text-center text-sm text-rose-500">Gagal memuat pertanyaan. Tutup dan coba lagi.</p>
          )}

          {showDisc && discItems.length > 0 && (
            <>
              <p className="mt-1 text-sm font-bold text-stone-700 dark:text-slate-200">Bagian 1 · DISC</p>
              <p className="-mt-1 text-xs text-stone-500 dark:text-slate-400">
                Untuk tiap kelompok, pilih kata yang <b>PALING</b> dan yang <b>KURANG</b> menggambarkan dirimu.
              </p>
              {discItems.map((it, i) => (
                <div
                  key={it.id}
                  className="rounded-2xl border border-paper-edge bg-paper-card p-3.5 shadow-card dark:border-slate-700 dark:bg-slate-800"
                >
                  <p className="mb-2 text-xs font-semibold text-stone-400 dark:text-slate-500">No. {i + 1}</p>
                  <div className="flex flex-col gap-1.5">
                    {it.words.map((w, wi) => {
                      const a = disc[it.id] || {}
                      return (
                        <div key={wi} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 text-sm text-stone-700 dark:text-slate-200">{w}</span>
                          <button
                            onClick={() => pickDisc(it.id, 'most', wi)}
                            disabled={a.least === wi}
                            className={clsx(
                              'rounded-lg px-2.5 py-1 text-xs font-bold transition active:scale-90 disabled:opacity-30',
                              a.most === wi
                                ? 'bg-emerald-500 text-white'
                                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
                            )}
                          >
                            Paling
                          </button>
                          <button
                            onClick={() => pickDisc(it.id, 'least', wi)}
                            disabled={a.most === wi}
                            className={clsx(
                              'rounded-lg px-2.5 py-1 text-xs font-bold transition active:scale-90 disabled:opacity-30',
                              a.least === wi
                                ? 'bg-rose-500 text-white'
                                : 'bg-rose-50 text-rose-500 dark:bg-rose-500/15 dark:text-rose-300',
                            )}
                          >
                            Kurang
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {showBf && bfItems.length > 0 && (
            <>
              <p className="mt-3 text-sm font-bold text-stone-700 dark:text-slate-200">Bagian 2 · Kepribadian</p>
              <p className="-mt-1 text-xs text-stone-500 dark:text-slate-400">
                Seberapa setuju kamu dengan tiap pernyataan? (1 = Sangat Tidak Setuju, 5 = Sangat Setuju)
              </p>
              {bfItems.map((it, i) => (
                <div
                  key={it.id}
                  className="rounded-2xl border border-paper-edge bg-paper-card p-3.5 shadow-card dark:border-slate-700 dark:bg-slate-800"
                >
                  <p className="mb-2.5 text-sm text-stone-700 dark:text-slate-200">
                    <span className="mr-1 text-xs font-semibold text-stone-400 dark:text-slate-500">{i + 1}.</span>
                    {it.text}
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {LIKERT.map((opt) => {
                      const active = bf[it.id] === opt.v
                      return (
                        <button
                          key={opt.v}
                          onClick={() => setBf((s) => ({ ...s, [it.id]: opt.v }))}
                          title={opt.label}
                          className={clsx(
                            'flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-sm font-bold transition active:scale-90',
                            active
                              ? 'bg-brand-600 text-white'
                              : 'bg-paper-line text-stone-600 dark:bg-slate-700 dark:text-slate-300',
                          )}
                        >
                          {opt.v}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-stone-400 dark:text-slate-500">
                    <span>Sangat Tidak Setuju</span>
                    <span>Sangat Setuju</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* footer */}
      <div className="sticky bottom-0 border-t border-paper-edge bg-paper/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto w-full max-w-2xl">
          {error && (
            <p className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
              {error}
            </p>
          )}
          <button
            onClick={submit}
            disabled={!allAnswered || submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-xl transition active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400 enabled:hover:scale-[1.02]"
          >
            {submitting ? (
              <>
                <Spinner className="h-5 w-5" /> Mengirim…
              </>
            ) : (
              <>
                <Send className="h-5 w-5" /> {allAnswered ? 'Kirim' : `Jawab semua (${answered}/${total || '…'})`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

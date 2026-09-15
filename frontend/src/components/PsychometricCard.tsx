import { Brain, RotateCcw } from 'lucide-react'
import { useConfirm } from '@/components/Confirm'
import { useResetDisc } from '@/hooks/useData'

// Big Five axis labels (Bahasa). Order matches OCEAN.
const BIG5: { k: string; label: string }[] = [
  { k: 'O', label: 'Keterbukaan' },
  { k: 'C', label: 'Kehati-hatian' },
  { k: 'E', label: 'Ekstraversi' },
  { k: 'A', label: 'Keramahan' },
  { k: 'N', label: 'Neurotisisme' },
]

function parseScores(s?: string | null): Record<string, number> {
  if (!s) return {}
  try {
    const o = JSON.parse(s)
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

// Fields the card reads. Satisfied by both EmployeeProfileAdmin (admin per-user view)
// and DiscSubmitResult / get_my_disc (self-view). scores are JSON strings.
export type PsychometricResult = {
  disc_type?: string | null
  disc_scores?: string | null
  personality_scores?: string | null
  disc_completed_on?: string | null
  personality_completed_on?: string | null
}

// Read-only psychometric summary. The DISC test flow (DiscReminderPopup) writes these
// fields; nothing here is editable. Renders nothing until at least one test is completed.
//
// `resetUser` turns on the one admin action there is: clearing the stored results so
// the reminder comes back (disc.reset_disc, System Manager only). Pass it from the
// admin per-user view; the self-view leaves it off.
export function PsychometricCard({ emp, resetUser }: { emp?: PsychometricResult; resetUser?: string }) {
  const confirm = useConfirm()
  const reset = useResetDisc()
  if (!emp || (!emp.disc_completed_on && !emp.personality_completed_on)) return null
  const big5 = parseScores(emp.personality_scores)
  return (
    <div className="rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
          <Brain className="h-4 w-4" />
        </span>
        <p className="text-sm font-bold text-stone-800 dark:text-slate-100">DISC &amp; Kepribadian</p>
        {resetUser && (
          <button
            aria-label="Reset hasil DISC"
            disabled={reset.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: 'Reset hasil DISC & kepribadian?',
                message: 'Hasil tersimpan akan dihapus dan orang ini akan diminta mengisi tesnya lagi. Tidak bisa dibatalkan.',
                confirmLabel: 'Reset',
                destructive: true,
              })
              if (ok) reset.mutate(resetUser)
            }}
            className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-stone-400 transition active:scale-95 active:text-rose-600 disabled:opacity-40 dark:text-slate-500"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
      </div>

      {emp.disc_completed_on && emp.disc_type && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-stone-500 dark:text-slate-400">Tipe DISC dominan</span>
          <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-bold tracking-wide text-white">
            {emp.disc_type}
          </span>
        </div>
      )}

      {emp.personality_completed_on && (
        <div className="flex flex-col gap-2">
          {BIG5.map(({ k, label }) => {
            const v = Math.max(0, Math.min(100, Number(big5[k] ?? 0)))
            return (
              <div key={k} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-stone-500 dark:text-slate-400">{label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${v}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-stone-600 dark:text-slate-300">
                  {Math.round(v)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

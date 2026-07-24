import { Brain } from 'lucide-react'
import { BentoTile } from '@web/components/bento'

// Read-only web bento tile for DISC + Big Five results. Fed by either the admin
// EmployeeProfile view (UserDashboard) or the caller's own get_my_disc self-view
// (MyInfo). Renders nothing until at least one sub-test is completed.
export interface PsychometricTileProps {
  disc_type?: string | null
  disc_scores?: string | null
  personality_scores?: string | null
  disc_completed_on?: string | null
  personality_completed_on?: string | null
}

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

export default function PsychometricTile(p: PsychometricTileProps) {
  if (!p.disc_completed_on && !p.personality_completed_on) return null
  return (
    <BentoTile span="md" tone="plain" title="DISC & Kepribadian">
      {p.disc_completed_on && p.disc_type && (
        <div className="mt-1 mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Brain className="h-4 w-4" />
          </span>
          <span className="text-xs text-muted">Tipe DISC dominan</span>
          <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-bold tracking-wide text-white">
            {p.disc_type}
          </span>
        </div>
      )}
      {p.personality_completed_on && (
        <div className="mt-1 flex flex-col gap-2">
          {BIG5.map(({ k, label }) => {
            const v = Math.max(0, Math.min(100, Number(parseScores(p.personality_scores)[k] ?? 0)))
            return (
              <div key={k} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-muted">{label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface dark:bg-slate-700">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${v}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">
                  {Math.round(v)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </BentoTile>
  )
}

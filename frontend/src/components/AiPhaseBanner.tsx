import { Bot, Check, Lock } from 'lucide-react'
import clsx from 'clsx'
import { AI_PHASES, aiPhaseOf } from '@/lib/filters'
import { useConfirmAiPrompt } from '@/hooks/useData'
import type { ProjectItem } from '@/lib/types'

/**
 * The AI ladder, explained in place: which phase this todo is on, what its name is,
 * and the one action that moves it forward. Shared by both frontends (mobile card and
 * web tile both mount it inside their existing Prompt panel) — the ladder's copy and
 * gating must not drift between them.
 *
 * Phase 3 is the only one a human moves by hand here: confirming releases the prompt to
 * the AI agent. Phase 1 -> 2 happens when the prompt-writing process saves a prompt.
 */
export function AiPhaseBanner({ todo }: { todo: ProjectItem }) {
  const confirm = useConfirmAiPrompt()
  const phase = aiPhaseOf(todo)
  if (phase === 0) return null

  const info = AI_PHASES[phase]
  const canConfirm = !!todo.can_confirm_prompt
  const confirmed = phase === 3

  return (
    <div className="mb-3 rounded-xl border border-violet-200 bg-white/70 p-3 dark:border-violet-500/30 dark:bg-slate-800/60">
      {/* 1 · 2 · 3 — the dots make "which phase, out of how many" readable at a glance. */}
      <div className="flex items-center gap-1.5">
        {([1, 2, 3] as const).map((p) => (
          <span
            key={p}
            title={`Fase ${p} · ${AI_PHASES[p].label}`}
            className={clsx(
              'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition',
              p < phase && 'bg-violet-200 text-violet-700 dark:bg-violet-500/30 dark:text-violet-200',
              p === phase && 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-sm',
              p > phase && 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500',
            )}
          >
            {p}
          </span>
        ))}
        <span className="ml-1 flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-violet-700 dark:text-violet-300">
          <Bot className="h-4 w-4 shrink-0" />
          Fase {phase} · {info.label}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{info.next}</p>

      {/* Phase 2 cannot be skipped: with no prompt saved there is nothing to confirm, so
          phase 1 shows the disabled reason instead of a button that would only error. */}
      {phase === 1 ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 dark:text-slate-500">
          <Lock className="h-3.5 w-3.5" /> Konfirmasi terkunci sampai prompt-nya ada.
        </p>
      ) : canConfirm ? (
        <button
          type="button"
          disabled={confirm.isPending}
          onClick={() => confirm.mutate({ todoName: todo.name, confirmed: !confirmed })}
          className={clsx(
            'mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition disabled:opacity-50',
            confirmed
              ? 'border border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10'
              : 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90',
          )}
        >
          <Check className="h-3.5 w-3.5" />
          {confirmed ? 'Batalkan konfirmasi' : 'Konfirmasi prompt'}
        </button>
      ) : (
        <p className="mt-2 text-xs italic text-slate-400 dark:text-slate-500">
          Hanya Leader, Owner, atau yang ditugaskan yang bisa konfirmasi.
        </p>
      )}
    </div>
  )
}

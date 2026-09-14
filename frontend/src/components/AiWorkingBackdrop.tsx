import { Bot } from 'lucide-react'

// Decorative "an agent is working on this" layer for an AI todo, mounted by the
// mobile card, the web todo row and the web detail drawer (see isAiWorking).
// Three cheap CSS layers — a faint circuit grid, a cyan scanline sweeping down,
// and the existing bot watermark breathing — so it reads as machinery running
// without a 3D library: the keyframes live in each frontend's index.css and all
// of them stop under prefers-reduced-motion.
//
// ponytail: CSS, not three.js. The ask named three.js for a 3D robot; a WebGL
// canvas per card costs ~600KB plus a GL context per row for background
// decoration. If a real 3D robot is wanted on the detail screen specifically,
// that is its own todo — this covers the card/row/drawer the ask lists.
//
// aria-hidden + pointer-events-none: it sits over the whole card, so it must
// never be announced and never swallow a tap. The running state is also carried
// in the card's visible label and title, which survive reduced-motion.
export function AiWorkingBackdrop({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <span className="tk-grid absolute inset-0" />
      <span className="tk-scan absolute inset-x-0 top-0 h-1/2" />
      <Bot className="tk-bob absolute -bottom-4 -right-3 h-28 w-28 text-cyan-500/20 dark:text-cyan-400/25" />
    </span>
  )
}

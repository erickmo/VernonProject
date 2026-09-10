/**
 * Badge colour per Job Application status — ONE definition, both frontends.
 *
 * Was hand-typed twice (mobile's RecruitmentApplicationsScreen as STATUS_HUE,
 * web's RecruitmentApplications as STATUS_TONE) and had already drifted: the
 * two maps were byte-identical on five of six statuses, and web alone had
 * Offered on `brand`. On web `brand` IS violet — the same hex at every stop —
 * and Interview is violet, so Interview and Offered rendered as the SAME colour
 * on the board recruiters scan. Mobile was right; web drifted.
 *
 * Shared rather than kept per-frontend precisely because those five identical
 * entries prove it was one choice made twice, not a deliberate per-platform
 * palette — the same test papanIklan.ts applies when it shares TYPE_TINT_WEB
 * but keeps mobile's separate TYPE_TONE.
 *
 * Every value must stay a DISTINCT colour family; recruitmentStatus.test.ts
 * enforces it, which is the check that would have caught the original drift.
 */
export const STATUS_TONE: Record<string, string> = {
  Submitted: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Screening: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Interview: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  Offered: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  Hired: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Rejected: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

/**
 * Neutral badge for a status this map has never seen. Deliberately NOT one of
 * the real tones: mobile previously fell back to STATUS_HUE.Submitted, so an
 * unrecognised status was rendered as a confident "Submitted" — the fail-OPEN
 * shape enum-drift finding #4 exists to prevent. Grey says "unknown" instead of
 * asserting a stage the application is not in. Web already did this with its own
 * bg-surface/text-muted tokens, which are web-only, so mobile gets the same
 * intent in mobile's palette.
 */
export const UNKNOWN_STATUS_TONE = 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'

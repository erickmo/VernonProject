import type { CreateTodoInitial } from './duplicateTodo'
import type { HelpEntry, ProjectItemDetail, StatusKey } from './types'

/** A todo raised as an issue on another todo (`issue_of` on the server). It is an
 *  ordinary todo — own assignee, deadline, group/level and points — that happens to
 *  point at the task it was found on. */
export interface TodoIssue {
  name: string
  to_do: string
  status: string
  status_key: StatusKey
  /** Server-side truth; mirrored by isIssueResolved() for locally-shaped rows. */
  resolved: boolean
  assigned_to: string
  assigned_to_name: string
  deadline: string | null
  deadline_human: string | null
  resolved_at_human: string | null
}

export interface IssueCounts {
  open: number
  resolved: number
  cancelled: number
}

/** Resolved means Completed: done AND approved by both leader and owner. Done and
 *  Checked By PL are mid-approval — the fix isn't signed off yet. Mirrors
 *  api/mobile.py::is_issue_resolved. */
export function isIssueResolved(statusKey: StatusKey): boolean {
  return statusKey === 'completed'
}

/** A cancelled issue is neither open nor resolved — it was dropped, not fixed. */
export function issueCounts(issues: TodoIssue[]): IssueCounts {
  const out: IssueCounts = { open: 0, resolved: 0, cancelled: 0 }
  for (const i of issues) {
    if (isIssueResolved(i.status_key)) out.resolved += 1
    else if (i.status_key === 'cancelled') out.cancelled += 1
    else out.open += 1
  }
  return out
}

/** One-line headline for the Issues section. Leads with what still needs doing. */
export function issueLabel(c: IssueCounts): string {
  const parts: string[] = []
  if (c.open) parts.push(`${c.open} open`)
  if (c.resolved) parts.push(c.open ? `${c.resolved} resolved` : `All ${c.resolved} resolved`)
  if (c.cancelled) parts.push(`${c.cancelled} cancelled`)
  return parts.join(' · ') || 'No issues'
}

/** Chip colour: something still open, everything cleared, or nothing raised. */
export function issueTone(c: IssueCounts): 'open' | 'clear' | 'none' {
  if (c.open > 0) return 'open'
  if (c.resolved > 0 || c.cancelled > 0) return 'clear'
  return 'none'
}

/** Seed the create form for "Report issue" on `host`.
 *
 *  Title is blank (that is the one thing only the reporter knows) and the estimate is
 *  left blank on purpose: it drives the points the fix earns, so it must be sized for
 *  the fix, not inherited from the task the issue was found on. Everything else — who
 *  owns the work, which group/level it scores under, when it is due — carries over so
 *  reporting costs two fields. */
export function todoIssueInitial(host: ProjectItemDetail, today: string): CreateTodoInitial {
  const deadline = host.deadline && host.deadline > today ? host.deadline : today
  return {
    toDo: '',
    assignedTo: host.assigned_to,
    startDate: today,
    deadline,
    group: host.group ?? '',
    typeName: host.level_type ?? '',
    levelId: host.level_id ?? '',
  }
}

// --- (i) copy ------------------------------------------------------------------------
// Same map on /m (bottom sheet) and /w (hover card) so the two never drift.

export const ISSUE_HELP: HelpEntry[] = [
  {
    term: 'apa-itu',
    title: 'Apa itu issue?',
    body:
      'Issue adalah tugas baru yang dibuat khusus untuk membereskan sesuatu yang ditemukan ' +
      'pada tugas ini — misalnya hasil revisi, bug, atau bagian yang terlewat. Karena issue ' +
      'adalah tugas biasa, ia punya penanggung jawab, tenggat, estimasi, dan poinnya sendiri.',
  },
  {
    term: 'kapan-selesai',
    title: 'Kapan issue dihitung selesai?',
    body:
      'Saat tugas issue-nya mencapai ✅ Completed, yaitu sudah dikerjakan DAN disetujui ' +
      'pemimpin lalu pemilik proyek. Status 🟠 Done dan 🔷 Checked By PL masih dihitung ' +
      'belum selesai karena persetujuannya belum lengkap.',
  },
  {
    term: 'dibatalkan',
    title: 'Issue yang dibatalkan',
    body:
      'Issue berstatus 🚫 Cancelled tidak dihitung selesai, tapi juga tidak lagi dihitung ' +
      'terbuka. Issue itu dibatalkan, bukan diperbaiki — jadi ia hanya tetap tercatat ' +
      'sebagai riwayat.',
  },
  {
    term: 'tidak-mengunci',
    title: 'Apakah issue mengunci tugas induknya?',
    body:
      'Tidak. Tugas induk tetap bisa dilanjutkan dan disetujui walau issue-nya belum ' +
      'selesai. Kalau memang ingin mengunci sampai sesuatu beres, pakai Dependencies ' +
      '(Blocked by) — itu memang untuk urutan pengerjaan.',
  },
  {
    term: 'siapa-boleh',
    title: 'Siapa yang bisa menambah issue?',
    body:
      'Sama seperti membuat tugas baru: pemilik proyek, pemimpin proyek, admin proyek, ' +
      'atau System Manager. Kalau tombolnya tidak muncul, sampaikan temuannya lewat ' +
      'komentar di tugas ini.',
  },
  {
    term: 'poin',
    title: 'Poin issue dihitung dari mana?',
    body:
      'Dari grup, level, dan estimasi waktu issue itu sendiri — persis seperti tugas lain, ' +
      'dan terpisah dari poin tugas induk. Karena itu estimasinya diisi sesuai besar ' +
      'perbaikannya, bukan disalin dari tugas induk.',
  },
  {
    term: 'bersarang',
    title: 'Boleh ada issue dari issue?',
    body:
      'Boleh. Sebuah issue bisa punya issue sendiri kalau perbaikannya memunculkan temuan ' +
      'baru. Yang ditolak sistem hanya rantai yang berputar kembali ke tugas yang sama.',
  },
]

export function issueHelp(term: string): HelpEntry | undefined {
  return ISSUE_HELP.find((h) => h.term === term)
}

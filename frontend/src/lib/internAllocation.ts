// Shared brains for the Intern Allocation report — used by BOTH /m and /w so the two
// frontends explain and filter the same numbers the same way. Presentation stays per app.
//
// The real logic (signals, thresholds, scoping) lives in api/report.py and is tested there;
// what is here is deliberately trivial — filtering and labels — because this repo has no JS
// test runner and adding one for a predicate would cost more than it protects.
import type { InternAllocationRow, InternAttentionReason } from './types'

// MUST match STALE_ASSIGNMENT_DAYS / REVIEW_WAIT_DAYS in vernon_project/api/report.py —
// these numbers are only quoted in the help copy, never used to compute anything here.
export const STALE_ASSIGNMENT_DAYS = 7
export const REVIEW_WAIT_DAYS = 3

// ---- (i) help copy ------------------------------------------------------------
// Bahasa, end-user voice. One source of truth for the (i) hints on both frontends.
export interface InternHelpEntry {
  term: string
  title: string
  body: string
}

export const INTERN_HELP: InternHelpEntry[] = [
  {
    term: 'assigned',
    title: 'Menit ditugaskan',
    body: 'Total menit kerja yang dijadwalkan untuk magang pada hari itu — diambil dari alokasi harian tugas, atau dari estimasi tugas yang jatuh tempo hari itu bila belum dialokasikan per hari.',
  },
  {
    term: 'planned',
    title: 'Menit direncanakan',
    body: 'Menit yang direncanakan sendiri oleh magang lewat Rencana Harian. Bisa berbeda dari menit ditugaskan: yang satu rencana pribadi magang, yang satu beban kerja yang diberikan pemimpin.',
  },
  {
    term: 'zero_days',
    title: 'Hari kosong',
    body: 'Jumlah hari kerja (Senin–Jumat) dalam rentang ini yang sama sekali tidak punya tugas. Akhir pekan tidak ikut dihitung, tetapi tetap ditampilkan bila ternyata ada tugas di sana.',
  },
  {
    term: 'stale',
    title: 'Terakhir diberi tugas',
    body: `Berapa hari sejak hari terakhir yang punya tugas. Lewat ${STALE_ASSIGNMENT_DAYS} hari tanpa tugas baru, baris ini ditandai perlu perhatian. Tugas yang dijadwalkan ke depan tidak dihitung sebagai kosong.`,
  },
  {
    term: 'waiting',
    title: 'Menunggu review',
    body: `Tugas yang sudah diselesaikan magang tetapi belum di-review pemimpin proyek (status Done atau Checked By PL). Tugas dari luar rentang tanggal ikut dihitung — justru yang menumpuk lama itu yang penting. Lewat ${REVIEW_WAIT_DAYS} hari, baris ditandai perlu perhatian.`,
  },
  {
    term: 'done',
    title: 'Selesai',
    body: 'Jumlah tugas yang ditandai selesai dibanding jumlah tugas magang pada rentang ini. Tugas yang hanya menunggu review dari luar rentang tidak ikut dihitung di sini.',
  },
  {
    term: 'late',
    title: 'Terlambat',
    body: 'Tugas yang tanggal selesainya melewati deadline. Dihitung saat magang menandai Done, bukan saat pemimpin menyetujui.',
  },
  {
    term: 'notes',
    title: 'Catatan pemimpin',
    body: 'Jumlah Catatan Pemimpin yang ditulis tentang magang ini dalam rentang tanggal. Penanda apakah pemimpin memberi arahan tertulis, bukan hanya membagi tugas.',
  },
  {
    term: 'attention',
    title: 'Perlu perhatian',
    body: 'Ditandai bila salah satu terjadi: tidak ada tugas sama sekali di seluruh hari kerja, tidak ada tugas baru terlalu lama, atau ada hasil kerja yang menunggu review terlalu lama.',
  },
  {
    term: 'sources',
    title: 'Sumber data magang',
    body: 'Magang dikenali dari dua tempat: penanda Member Type pada data pengguna, dan status kepegawaian pada Profil Karyawan. Daftar ini menggabungkan keduanya dan setiap baris menunjukkan asalnya — jadi data yang tidak sinkron terlihat, bukan hilang.',
  },
  {
    term: 'project_minutes',
    title: 'Menit per proyek',
    body: 'Total estimasi tugas magang di proyek tersebut untuk jendela ini. Kisi harian memakai alokasi per hari, jadi kedua angka wajar berbeda.',
  },
  {
    term: 'scope',
    title: 'Siapa yang terlihat',
    body: 'Tim HR dan System Manager melihat seluruh magang. Pemilik/pemimpin/admin proyek hanya melihat magang pada proyek yang mereka pegang.',
  },
]

export function internHelp(term: string): InternHelpEntry | undefined {
  return INTERN_HELP.find((h) => h.term === term)
}

// ---- labels -------------------------------------------------------------------
export const REASON_LABEL: Record<InternAttentionReason, string> = {
  idle: 'Tidak ada tugas',
  stale: 'Lama tak diberi tugas',
  waiting: 'Menunggu review',
}

// ---- pure view helpers --------------------------------------------------------
/** Sat/Sun — the days `zero_days` deliberately ignores. */
export function isWeekend(date: string): boolean {
  const d = new Date(`${date}T00:00:00`).getDay()
  return d === 0 || d === 6
}

/** Heat band for one day cell. `threshold` is Vernon Settings.min_daily_estimated_minutes;
 *  when it is 0 (as on a site that never set it) there is no "thin" band, only empty/ok. */
export function cellBand(minutes: number, threshold: number): 'empty' | 'thin' | 'ok' {
  if (minutes <= 0) return 'empty'
  if (threshold > 0 && minutes < threshold) return 'thin'
  return 'ok'
}

/** Sentinel leader filter value: rows whose projects have no project leader at all.
 *  Safe against collision — a real leader value is always a user id (email). */
export const NO_LEADER = '__none__'
export const NO_LEADER_LABEL = 'Tanpa pemimpin'

export interface InternFilters {
  q: string
  leader: string
  project: string
  source: '' | 'member_type' | 'profile'
  attentionOnly: boolean
}

export const EMPTY_INTERN_FILTERS: InternFilters = {
  q: '', leader: '', project: '', source: '', attentionOnly: false,
}

export function filterInternRows(rows: InternAllocationRow[], f: InternFilters): InternAllocationRow[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.attentionOnly && !r.attention) return false
    if (f.source && !r.sources.includes(f.source)) return false
    if (f.leader === NO_LEADER) {
      if (r.leaders.length) return false
    } else if (f.leader && !r.leaders.some((l) => l.leader === f.leader)) return false
    if (f.project && !r.projects.some((p) => p.project === f.project)) return false
    if (q && !`${r.full_name} ${r.user}`.toLowerCase().includes(q)) return false
    return true
  })
}

/** Leader/project options for the filter selects, derived from the loaded rows —
 *  no extra endpoint, and the lists can never offer something the data doesn't have. */
export function internFilterOptions(rows: InternAllocationRow[]) {
  const leaders = new Map<string, string>()
  const projects = new Map<string, string>()
  for (const r of rows) {
    for (const l of r.leaders) leaders.set(l.leader, l.leader_name || l.leader)
    for (const p of r.projects) projects.set(p.project, p.project_name || p.project)
  }
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label)
  // "Tanpa pemimpin" is offered only when some row actually has no leader, so the select
  // can never present a filter that returns nothing.
  const noLeader = rows.some((r) => !r.leaders.length) ? [{ value: NO_LEADER, label: NO_LEADER_LABEL }] : []
  return {
    leaders: [...noLeader, ...[...leaders].map(([value, label]) => ({ value, label })).sort(byLabel)],
    projects: [...projects].map(([value, label]) => ({ value, label })).sort(byLabel),
  }
}

/** "Rab 19 Agu" — compact column/chip label. */
export function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Widest period the pickers allow. The endpoint's guard is `date_diff(end, start) >
// MAX_SPAN_DAYS` with MAX_SPAN_DAYS = 92, which admits 93 INCLUSIVE days — this cap is
// deliberately one day stricter so a reachable pick can never 403. Raise report.py first
// if this ever grows.
export const MAX_RANGE_DAYS = 92

/** Inclusive day count of [from, to]. Reversed or unparseable input -> 0. */
export function spanDays(from: string, to: string): number {
  const a = Date.parse(from)
  const b = Date.parse(to)
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

/** Shift a YYYY-MM-DD by whole days, staying on the calendar (no UTC drift). */
export function addDaysISO(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** The bounds each picker must enforce so any pick stays a range the endpoint accepts:
 *  `to` never before `from`, and the span never wider than MAX_RANGE_DAYS. */
export function rangeBounds(from: string, to: string) {
  return {
    fromMax: to || undefined,
    fromMin: to ? addDaysISO(to, -(MAX_RANGE_DAYS - 1)) : undefined,
    toMin: from || undefined,
    toMax: from ? addDaysISO(from, MAX_RANGE_DAYS - 1) : undefined,
  }
}

/** Inclusive [from, to] for the last `days` days ending today. */
export function lastDays(days: number): [string, string] {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - (days - 1))
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return [iso(from), iso(to)]
}

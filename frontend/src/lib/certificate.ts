// Shared, presentation-free logic for internship certificates. Both frontends import
// this; only the rendering differs between /m and /w.

import type { CertificateDetail, CertificateStatus, LiveScore, RubricLine } from './types'

/** The rubric the leader fills. Mirrors RUBRIC in api/intern_score.py — the server is
 *  authoritative and re-imposes these labels and weights on save, so a tampered payload
 *  cannot reweight the rubric it is being judged by. */
export const RUBRIC_TEMPLATE = [
  { key: 'quality', label: 'Kualitas Kerja', weight: 30 },
  { key: 'discipline', label: 'Kedisiplinan', weight: 20 },
  { key: 'initiative', label: 'Inisiatif', weight: 20 },
  { key: 'collaboration', label: 'Kolaborasi', weight: 15 },
  { key: 'communication', label: 'Komunikasi', weight: 15 },
] as const

export const STATUS_LABEL: Record<CertificateStatus, string> = {
  Draft: 'Draf',
  'Pending HR': 'Menunggu HR',
  Published: 'Terbit',
  Revoked: 'Dicabut',
}

/** Bahasa label for a status *transition*, i.e. what the button says. */
export const ACTION_LABEL: Record<CertificateStatus, string> = {
  Draft: 'Kembalikan ke draf',
  'Pending HR': 'Ajukan ke HR',
  Published: 'Terbitkan',
  Revoked: 'Cabut sertifikat',
}

export const STATUS_TONE: Record<CertificateStatus, 'plain' | 'warn' | 'good' | 'bad'> = {
  Draft: 'plain',
  'Pending HR': 'warn',
  Published: 'good',
  Revoked: 'bad',
}

/** Grade bands mirror GRADE_BANDS in api/intern_score.py. */
export function gradeFor(score: number | null | undefined): string | null {
  if (score === null || score === undefined) return null
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  return 'D'
}

export function gradeTone(grade: string | null | undefined): 'good' | 'ok' | 'warn' | 'bad' | 'none' {
  switch (grade) {
    case 'A': return 'good'
    case 'B': return 'ok'
    case 'C': return 'warn'
    case 'D': return 'bad'
    default: return 'none'
  }
}

/** "88.0", or an em dash when nothing could be measured. Never renders a missing score
 *  as 0 — "no evidence" and "evidence of failure" are different answers. */
export function fmtScore(score: number | null | undefined): string {
  return score === null || score === undefined ? '—' : score.toFixed(1)
}

/** Weighted mean of the judged rubric lines. Mirrors compute_rubric_score; used to show
 *  the leader their running total as they type, before any round trip. */
export function rubricScore(lines: { weight: number; score: number | null }[]): number | null {
  let weighted = 0
  let total = 0
  for (const l of lines) {
    if (l.score === null || Number.isNaN(l.score)) continue
    const w = Number(l.weight) || 0
    if (w <= 0) continue
    weighted += Math.max(0, Math.min(100, Number(l.score))) * w
    total += w
  }
  return total ? Math.round((weighted / total) * 10) / 10 : null
}

/** How much of the rubric the leader has filled in — drives the progress hint. */
export function rubricProgress(lines: { score: number | null }[]): { done: number; total: number } {
  return { done: lines.filter((l) => l.score !== null).length, total: lines.length }
}

/** The auto-score components the engine DROPPED, as keys. A dropped component is one
 *  that had no denominator (no courses enrolled, no scheduled days), and the UI must say
 *  so — silence reads as "you scored zero here". */
export function droppedComponents(live: Pick<LiveScore, 'components'>): string[] {
  const present = new Set(live.components.map((c) => c.key))
  return AUTO_COMPONENTS.filter((c) => !present.has(c.key)).map((c) => c.key)
}

export const AUTO_COMPONENTS = [
  { key: 'completion', label: 'Penyelesaian Tugas', weight: 30 },
  { key: 'timeliness', label: 'Ketepatan Waktu', weight: 25 },
  { key: 'attendance', label: 'Kehadiran', weight: 20 },
  { key: 'contribution', label: 'Kontribusi Poin', weight: 15 },
  { key: 'learning', label: 'Pembelajaran', weight: 10 },
] as const

export function componentLabel(key: string): string {
  return AUTO_COMPONENTS.find((c) => c.key === key)?.label ?? key
}

/** Blank rubric for a new certificate; an existing one is merged onto it by key so a
 *  criterion added later still appears on an old draft. */
export function rubricFrom(detail?: Pick<CertificateDetail, 'rubric'> | null) {
  const byLabel = new Map((detail?.rubric ?? []).map((r: RubricLine) => [r.label, r]))
  return RUBRIC_TEMPLATE.map((t) => {
    const found = byLabel.get(t.label)
    return { key: t.key, label: t.label, weight: t.weight,
      score: found ? found.score : null, comment: found?.comment ?? '' }
  })
}

/** Clamp a typed rubric score. Applied on COMMIT, never per keystroke — clamping while
 *  someone types turns "90" into "9" on a 0-100 field the moment they pass the cap. */
export function clampScore(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  if (Number.isNaN(n)) return null
  return Math.max(0, Math.min(100, n))
}

export function canDownload(detail: Pick<CertificateDetail, 'status'>): boolean {
  return detail.status === 'Published'
}

// --- (i) help ------------------------------------------------------------------------
// Everything here is a question a real reader asks. Keep the answers concrete.

export interface HelpEntry { term: string; title: string; body: string }

export const CERT_HELP: HelpEntry[] = [
  {
    term: 'dua-nilai',
    title: 'Kenapa nilainya ada dua?',
    body:
      'Nilai Kinerja dihitung otomatis dari catatan aplikasi: tugas selesai, ketepatan waktu, ' +
      'kehadiran, poin, dan pembelajaran. Nilai Penilaian diisi pembimbing. Keduanya sengaja ' +
      'tidak dirata-ratakan, karena justru bedanya yang menarik: peserta dengan angka biasa ' +
      'tapi dinilai tinggi pembimbing, atau sebaliknya.',
  },
  {
    term: 'nilai-berubah',
    title: 'Kenapa nilainya bisa berubah?',
    body:
      'Selama sertifikat masih draf, Nilai Kinerja dihitung ulang setiap kali dibuka, jadi ' +
      'selalu mengikuti data terbaru. Begitu HR menerbitkan, nilainya dibekukan dan tidak ' +
      'akan berubah lagi — supaya kertas yang dipegang orang tidak pernah berbeda dengan ' +
      'yang muncul saat QR-nya dipindai.',
  },
  {
    term: 'komponen-hilang',
    title: 'Kenapa ada komponen yang tidak muncul?',
    body:
      'Komponen yang tidak punya pembanding akan dilewati, bukan dinilai nol. Contoh: peserta ' +
      'yang tidak pernah didaftarkan ke kelas mana pun tidak dinilai pada Pembelajaran, dan ' +
      'bobotnya dibagikan ke komponen lain. Menilainya nol sama saja menghukum peserta atas ' +
      'sesuatu yang tidak pernah diberikan kepadanya.',
  },
  {
    term: 'kriteria-kosong',
    title: 'Boleh mengosongkan kriteria penilaian?',
    body:
      'Boleh. Kriteria yang dikosongkan diabaikan saat menghitung, bukan dihitung nol. ' +
      'Isi 0 hanya bila memang menilai nol.',
  },
  {
    term: 'qr',
    title: 'Apa yang dibuktikan QR-nya?',
    body:
      'QR mengarah ke halaman publik yang membuktikan bahwa Vernon benar menerbitkan ' +
      'sertifikat bernomor itu untuk orang itu, lengkap dengan periode dan rincian nilainya. ' +
      'Halaman itu tidak menilai bagus atau tidaknya kinerja — angkanya yang bicara. ' +
      'Siapa pun bisa membukanya tanpa akun.',
  },
  {
    term: 'dicabut',
    title: 'Apa artinya sertifikat dicabut?',
    body:
      'Sertifikat yang dicabut tetap tersimpan dan QR-nya tetap bisa dipindai — hasilnya ' +
      'berubah menjadi "telah dicabut" beserta tanggal dan alasannya. Sengaja tidak dihapus: ' +
      '"kami mencabutnya" dan "kami tidak pernah menerbitkannya" adalah dua jawaban yang ' +
      'sangat berbeda bagi orang yang memegang kertasnya. Pencabutan tidak bisa dibatalkan.',
  },
  {
    term: 'alur',
    title: 'Siapa yang menerbitkan?',
    body:
      'Pembimbing membuat draf dan mengisi penilaian, lalu mengajukannya ke HR. HR yang ' +
      'menerbitkan. Hanya sertifikat terbit yang punya nomor, QR, dan halaman verifikasi.',
  },
  {
    term: 'terlambat',
    title: 'Apakah keterlambatan menurunkan Kehadiran?',
    body:
      'Tidak. Datang terlambat tetap dihitung hadir — kedisiplinan dinilai sekali saja, oleh ' +
      'pembimbing, pada kriteria Kedisiplinan. Cuti yang disetujui juga tidak dihitung ' +
      'sebagai hari bolos: hari itu memang tidak dijadwalkan bekerja.',
  },
  {
    term: 'tugas-menunggu',
    title: 'Tugas yang menunggu review dihitung selesai?',
    body:
      'Ya. Tugas berstatus Done atau Checked By PL sudah selesai dari sisi peserta; yang ' +
      'tersisa hanya review pembimbing. Menghitungnya belum selesai sama saja menghukum ' +
      'peserta atas antrean orang lain.',
  },
]

export function certHelp(term: string): HelpEntry | undefined {
  return CERT_HELP.find((h) => h.term === term)
}

// Shared Bahasa help content for the Shift Templates & Assignments screens.
// Rendered by ScheduleHelpSheet (mobile /m) and ScheduleHelpDrawer (web /w).

export type HelpSection = { heading: string; points: string[] }

export const SCHEDULE_HELP_TITLE = 'Cara kerja Jadwal & Shift'

export const SCHEDULE_HELP: HelpSection[] = [
  {
    heading: 'Apa itu Template Shift?',
    points: [
      'Template shift adalah pola jam kerja untuk sebuah peran — misalnya “Kasir” atau “Staf Gudang”.',
      'Setiap template punya jam mulai & selesai, dan menit kerja minimum untuk tiap hari dalam seminggu.',
      'Menit minimum 0 pada suatu hari berarti mengikuti pengaturan default brand untuk hari itu.',
    ],
  },
  {
    heading: 'Apa itu Penugasan?',
    points: [
      'Penugasan menautkan seorang karyawan ke sebuah template shift.',
      'Anda memilih tanggal mulai berlaku dan mencentang hari-hari kerja karyawan (misalnya libur Sabtu & Minggu).',
      'Karyawan mengikuti template yang ditugaskan padanya, hanya pada hari yang dicentang.',
    ],
  },
  {
    heading: 'Apa pengaruhnya?',
    points: [
      'Menit minimum menjadi target kerja harian karyawan pada hari itu.',
      'Hari dengan 0 menit dianggap libur: tugas berulang otomatis tidak dijadwalkan pada hari tersebut.',
      'Perhitungan kehadiran dan sisa cuti mengikuti jadwal ini.',
    ],
  },
  {
    heading: 'Langkah pakai',
    points: [
      '1. Buat Template Shift lebih dulu di layar Template.',
      '2. Tugaskan karyawan ke template itu di layar Penugasan.',
      'Nama template tidak bisa diubah setelah dibuat. Template hanya bisa dihapus jika belum dipakai penugasan mana pun.',
    ],
  },
]

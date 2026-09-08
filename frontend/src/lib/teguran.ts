import type { TeguranKategori, TeguranStatus } from './types'

// Shared between /m and /w (labels only — each platform keeps its own status
// color tone, same split as papanIklan.ts's TYPE_LABEL vs TYPE_TINT_WEB).
export const KATEGORI_OPTIONS: { value: TeguranKategori; label: string }[] = [
  { value: 'Keterlambatan', label: 'Keterlambatan' },
  { value: 'Absen Tanpa Izin', label: 'Absen Tanpa Izin' },
  { value: 'Kinerja', label: 'Kinerja' },
  { value: 'Perilaku', label: 'Perilaku' },
  { value: 'Lainnya', label: 'Lainnya' },
]

export const STATUS_LABEL: Record<TeguranStatus, string> = {
  Diterbitkan: 'Menunggu Diakui',
  Diakui: 'Diakui',
  Dibatalkan: 'Dibatalkan',
}

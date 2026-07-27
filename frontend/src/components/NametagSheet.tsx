// Printable employee nametag sheet — shared by /m and /w (route: /team-wall/nametags).
// Renders one badge per selected employee: company logo + REAL photo (user_image,
// not the gamified DiceBear avatar) + name + jabatan. Print via the browser: an
// @media-print stylesheet hides all app chrome and paginates fixed-size badges.
//
// Selection arrives as `location.state.users` (array of User names) from NametagPicker.
// On a fresh load / refresh (state lost) it falls back to the whole roster.
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Printer, ArrowLeft } from 'lucide-react'
import { useTeamWall, useBoot } from '@/hooks/useData'
import type { TeamWallUser } from '@/lib/types'

// A4, 3 badges across × 3 down = 9 per page. Cards get their real mm size only in
// print; on screen they size to content as a preview.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 10mm; }
  body * { visibility: hidden !important; }
  .nametag-print-area, .nametag-print-area * { visibility: visible !important; }
  .nametag-print-area { position: absolute; inset: 0; background: #fff; }
  .nametag-no-print { display: none !important; }
  .nametag-grid { gap: 0 !important; padding: 0 !important; }
  .nametag-card {
    width: 54mm; height: 90mm; margin: 0;
    page-break-inside: avoid; break-inside: avoid;
    border: 1px dashed #bbb !important; border-radius: 0 !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .nametag-face, .nametag-logo {
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
}
`

export default function NametagSheet() {
  const nav = useNavigate()
  const location = useLocation()
  const selected = (location.state as { users?: string[] } | null)?.users ?? null
  const { data } = useTeamWall()
  const logo = useBoot().data?.settings?.app_logo || ''

  const users = useMemo<TeamWallUser[]>(() => {
    const all = data?.users ?? []
    if (!selected || selected.length === 0) return all
    const set = new Set(selected)
    return all.filter((u) => set.has(u.name))
  }, [data, selected])

  // Auto-open the print dialog once every real photo has loaded, so faces aren't
  // blank in the printout. Only the REAL photo counts — the gamified avatar snapshot
  // (user_image) is intentionally NOT used on the tag; no-photo users print a blank spot.
  const photoCount = users.filter((u) => u.photo).length
  const [loaded, setLoaded] = useState(0)
  const [printed, setPrinted] = useState(false)
  useEffect(() => {
    if (!users.length || printed || loaded < photoCount) return
    setPrinted(true)
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [users.length, loaded, photoCount, printed])

  if (data && !users.length) {
    return (
      <div className="nametag-no-print flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-slate-500 dark:text-slate-400">Tidak ada karyawan yang dipilih.</p>
        <button
          onClick={() => nav('/team-wall')}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Kembali ke Team Wall
        </button>
      </div>
    )
  }

  return (
    <div className="nametag-print-area bg-white">
      <style>{PRINT_CSS}</style>

      {/* Toolbar — screen only */}
      <div className="nametag-no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <button
          onClick={() => nav('/team-wall')}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>
        <span className="text-sm text-slate-500">{users.length} nametag</span>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" /> Cetak
        </button>
      </div>

      {/* Sheet */}
      <div className="nametag-grid mx-auto flex flex-wrap content-start justify-center gap-2 p-4">
        {users.map((u) => {
          const name = u.full_name || u.name
          return (
            <div
              key={u.name}
              className="nametag-card flex w-40 flex-col items-center justify-start gap-2 rounded-lg border border-slate-300 p-3 text-center"
            >
              {logo ? <img src={logo} alt="" className="nametag-logo h-6 object-contain" /> : null}
              {u.photo ? (
                <img
                  src={u.photo}
                  alt=""
                  onLoad={() => setLoaded((n) => n + 1)}
                  onError={() => setLoaded((n) => n + 1)}
                  className="nametag-face h-28 w-28 rounded-full object-cover ring-1 ring-slate-200"
                />
              ) : (
                // No real photo → blank circle placeholder (never the gamified avatar).
                <div className="nametag-face h-28 w-28 rounded-full ring-1 ring-slate-200" />
              )}
              <div className="min-w-0">
                <p className="nametag-name truncate text-base font-bold text-slate-900">{name}</p>
                {u.job_title ? (
                  <p className="nametag-title truncate text-sm text-slate-500">{u.job_title}</p>
                ) : null}
                {u.is_intern && (u.school || u.major) ? (
                  <p className="nametag-edu truncate text-xs text-slate-400">
                    {[u.school, u.major].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

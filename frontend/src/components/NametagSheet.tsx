// Printable employee lanyard badge — shared by /m and /w (route: /team-wall/nametags).
// CR80 portrait (54 × 85.6 mm — credit-card size, fits rigid lanyard holders). Premium
// conference-badge look: indigo gradient header with a lanyard slot + company logo, a
// photo medallion overlapping the band, the name in a bold display face, jabatan, and a
// school·major chip for interns. The screen card is drawn at the EXACT physical size
// (204 × 323 px = 54 × 85.6 mm @96dpi) so the preview is pixel-faithful to the print.
//
// No real photo → a blank photo well (never the gamified DiceBear avatar). Selection
// arrives as `location.state.users` (User names) from NametagPicker; a fresh load with no
// state falls back to the whole roster. An @media-print sheet hides app chrome, restores
// mm sizing + color, and paginates 3×3 per A4.
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Printer, ArrowLeft, GraduationCap } from 'lucide-react'
import { useTeamWall, useBoot } from '@/hooks/useData'
import type { TeamWallUser } from '@/lib/types'

// A4 (210×297), 8mm margins → 194×281 usable. 54×85.6 badges: 3 across, 3 down = 9/page.
// The card is already sized in px==mm on screen; print only re-asserts mm, kills the
// screen shadow/animation, forces color, and lays out the grid with a light cut gap.
const PRINT_CSS = `
@keyframes nametagRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
.nametag-card { animation: nametagRise .5s cubic-bezier(.22,1,.36,1) both; }
@media print {
  @page { size: A4; margin: 8mm; }
  body * { visibility: hidden !important; }
  .nametag-print-area, .nametag-print-area * { visibility: visible !important; }
  .nametag-print-area { position: absolute; inset: 0; background: #fff; }
  .nametag-no-print { display: none !important; }
  .nametag-grid { gap: 4mm !important; padding: 0 !important; }
  .nametag-card {
    width: 54mm !important; height: 85.6mm !important; margin: 0 !important;
    border-radius: 3mm !important; box-shadow: none !important; animation: none !important;
    outline: 0.2mm dashed #cbd5e1 !important; outline-offset: 1.2mm;
    page-break-inside: avoid; break-inside: avoid;
  }
  .nametag-card * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`

// Diagonal guilloché weave for the header band — subtle premium texture, prints via color-adjust.
const BAND_TEXTURE =
  'repeating-linear-gradient(45deg, rgba(255,255,255,.10) 0 1px, transparent 1px 7px),' +
  'repeating-linear-gradient(-45deg, rgba(255,255,255,.07) 0 1px, transparent 1px 9px)'

function Badge({ u, logo, value }: { u: TeamWallUser; logo: string; value: string }) {
  const name = u.full_name || u.name
  const edu = [u.school, u.major].filter(Boolean).join(' · ')
  const showEdu = !!u.is_intern && !!edu

  return (
    <div className="nametag-card relative h-[323px] w-[204px] shrink-0 overflow-hidden rounded-[16px] bg-white shadow-[0_12px_30px_-8px_rgba(49,46,129,.35)] ring-1 ring-slate-200">
      {/* Header band */}
      <div
        className="nametag-band absolute inset-x-0 top-0 h-[112px] bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600"
      >
        <div className="absolute inset-0" style={{ backgroundImage: BAND_TEXTURE }} />
        {/* soft light blob */}
        <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/20 blur-2xl" />
        {/* lanyard slot */}
        <div className="absolute left-1/2 top-[9px] h-[7px] w-[54px] -translate-x-1/2 rounded-full bg-white/85 ring-1 ring-indigo-900/20" />
        {/* company logo on a crisp white chip so any logo reads */}
        {logo ? (
          <div className="absolute left-1/2 top-[26px] flex h-[34px] -translate-x-1/2 items-center rounded-full bg-white px-3 shadow-sm">
            <img src={logo} alt="" className="nametag-logo h-[20px] max-w-[110px] object-contain" />
          </div>
        ) : null}
      </div>

      {/* Photo medallion — overlaps the band bottom edge */}
      <div className="absolute left-1/2 top-[74px] h-[92px] w-[92px] -translate-x-1/2">
        <div className="absolute -inset-[3px] rounded-full bg-gradient-to-br from-indigo-400 to-violet-500" />
        {u.photo ? (
          <img
            src={u.photo}
            alt=""
            className="nametag-face relative h-[92px] w-[92px] rounded-full border-[4px] border-white object-cover"
          />
        ) : (
          // No real photo → blank well (dashed ring, faint tint). Never the avatar.
          <div className="nametag-face relative flex h-[92px] w-[92px] items-center justify-center rounded-full border-[4px] border-white bg-indigo-50">
            <span className="h-[64px] w-[64px] rounded-full border-2 border-dashed border-indigo-200" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="absolute inset-x-0 top-[176px] px-3 text-center">
        <h2
          className="line-clamp-2 break-words text-[19px] font-extrabold uppercase leading-[1.02] tracking-tight text-indigo-950"
          style={{ fontFamily: '"Familjen Grotesk", "Figtree", ui-sans-serif, system-ui, sans-serif' }}
        >
          {name}
        </h2>
        {u.job_title ? (
          <p className="mt-[6px] truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-indigo-500">
            {u.job_title}
          </p>
        ) : null}
        {showEdu ? (
          <div className="mt-[9px] inline-flex max-w-full items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-[3px] ring-1 ring-indigo-100">
            <GraduationCap className="h-[11px] w-[11px] shrink-0 text-indigo-500" />
            <span className="truncate text-[8.5px] font-semibold text-indigo-700">{edu}</span>
          </div>
        ) : null}
      </div>

      {/* Footer accent bar — company value/motto, or a decorative bar when unset */}
      <div className="absolute inset-x-0 bottom-0 flex h-[18px] items-center justify-center gap-[6px] bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600">
        {value ? (
          <span className="truncate px-3 text-[7px] font-bold uppercase tracking-[0.2em] text-white">{value}</span>
        ) : (
          <>
            <span className="h-[3px] w-[3px] rounded-full bg-white/70" />
            <span className="h-[3px] w-[16px] rounded-full bg-white/70" />
            <span className="h-[3px] w-[3px] rounded-full bg-white/70" />
          </>
        )}
      </div>
    </div>
  )
}

export default function NametagSheet() {
  const nav = useNavigate()
  const location = useLocation()
  const selected = (location.state as { users?: string[] } | null)?.users ?? null
  const { data } = useTeamWall()
  const bootSettings = useBoot().data?.settings
  const logo = bootSettings?.app_logo || ''
  const value = bootSettings?.nametag_value || ''

  const users = useMemo<TeamWallUser[]>(() => {
    const all = data?.users ?? []
    if (!selected || selected.length === 0) return all
    const set = new Set(selected)
    return all.filter((u) => set.has(u.name))
  }, [data, selected])

  // Auto-open the print dialog once every real photo has loaded, so faces aren't blank in the
  // printout. Only the REAL photo counts — the gamified avatar (user_image) is never used here.
  const photoCount = users.filter((u) => u.photo).length
  const [loaded, setLoaded] = useState(0)
  const [printed, setPrinted] = useState(false)
  // Count loads at the sheet level so the print gate is decoupled from the Badge subtree.
  useEffect(() => {
    setLoaded(0)
    setPrinted(false)
  }, [users])
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
    <div className="nametag-print-area min-h-screen bg-slate-100">
      <style>{PRINT_CSS}</style>

      {/* Toolbar — screen only */}
      <div className="nametag-no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <button
          onClick={() => nav('/team-wall')}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>
        <span className="text-sm text-slate-500">{users.length} nametag · 54×86mm</span>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" /> Cetak
        </button>
      </div>

      {/* Sheet — hidden preload imgs drive the print gate without coupling to the Badge tree */}
      <div className="hidden">
        {users.map((u) =>
          u.photo ? (
            <img key={u.name} src={u.photo} alt="" onLoad={() => setLoaded((n) => n + 1)} onError={() => setLoaded((n) => n + 1)} />
          ) : null,
        )}
      </div>
      <div className="nametag-grid mx-auto flex max-w-[900px] flex-wrap content-start justify-center gap-5 p-6">
        {users.map((u) => (
          <Badge key={u.name} u={u} logo={logo} value={value} />
        ))}
      </div>
    </div>
  )
}

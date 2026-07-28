// Nametag selection list — shared by /m and /w Team Wall "Nametag" mode.
// Pick employees (search + select-all), then "Cetak Nametag" hands the chosen
// User names to the print sheet via router state. Shows the REAL photo thumbnail
// (Employee Profile.photo) so you pick by face, matching the printed badge. HR/SysMgr
// get a per-row trash to remove an inappropriate photo (the person can re-upload).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Printer, Search, Check, Trash2 } from 'lucide-react'
import { useBoot, canHrApprove, keys } from '@/hooks/useData'
import { useConfirm } from './Confirm'
import { useToast } from './Toast'
import { mobileApi } from '../lib/api'
import type { TeamWallUser } from '@/lib/types'

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

export function NametagPicker({ users }: { users: TeamWallUser[] }) {
  const nav = useNavigate()
  const { data: boot } = useBoot()
  const canHr = canHrApprove(boot)
  const confirm = useConfirm()
  const toast = useToast()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())

  // HR/SysMgr: clear a user's real photo (e.g. inappropriate upload). They can re-upload.
  const removePhoto = async (u: TeamWallUser) => {
    const ok = await confirm({
      title: 'Hapus foto?',
      message: `Hapus foto ${u.full_name || u.name}? Mereka bisa mengunggah ulang.`,
      confirmLabel: 'Hapus',
      destructive: true,
    })
    if (!ok) return
    try {
      await mobileApi.hrRemovePhoto(u.name)
      qc.invalidateQueries({ queryKey: keys.teamWall })
      toast('success', 'Foto dihapus')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Gagal menghapus foto')
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter(
      (u) =>
        (u.full_name || u.name).toLowerCase().includes(s) ||
        (u.job_title || '').toLowerCase().includes(s),
    )
  }, [users, q])

  const allFilteredSelected = filtered.length > 0 && filtered.every((u) => sel.has(u.name))
  const toggle = (name: string) =>
    setSel((cur) => {
      const n = new Set(cur)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })
  const toggleAll = () =>
    setSel((cur) => {
      const n = new Set(cur)
      if (allFilteredSelected) filtered.forEach((u) => n.delete(u.name))
      else filtered.forEach((u) => n.add(u.name))
      return n
    })
  const print = () => {
    if (!sel.size) return
    nav('/team-wall/nametags', { state: { users: [...sel] } })
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama / jabatan…"
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
        <button
          onClick={toggleAll}
          className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
        >
          {allFilteredSelected ? 'Batal semua' : 'Pilih semua'}
        </button>
      </div>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
        {filtered.map((u) => {
          const name = u.full_name || u.name
          const on = sel.has(u.name)
          return (
            <button
              key={u.name}
              onClick={() => toggle(u.name)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              {u.photo ? (
                <img src={u.photo} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                // No real photo → initials, never the gamified avatar (user_image).
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-400 dark:bg-slate-700">
                  {initials(name)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{name}</span>
                {u.job_title ? (
                  <span className="block truncate text-xs text-slate-400">{u.job_title}</span>
                ) : null}
              </span>
              {canHr && u.photo ? (
                <span
                  role="button"
                  tabIndex={0}
                  title="Hapus foto (HR)"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    removePhoto(u)
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </span>
              ) : null}
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                {on ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
            </button>
          )
        })}
      </div>

      <div className="sticky bottom-4 flex justify-center">
        <button
          onClick={print}
          disabled={!sel.size}
          className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50"
        >
          <Printer className="h-4 w-4" /> Cetak Nametag{sel.size ? ` (${sel.size})` : ''}
        </button>
      </div>
    </div>
  )
}

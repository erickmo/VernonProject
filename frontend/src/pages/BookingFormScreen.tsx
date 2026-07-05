import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useCreateBooking, useCheckAvailability, useRooms, useEquipment } from '@/hooks/useData'
import type { Conflict } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

// Frappe stores 'YYYY-MM-DD HH:MM:SS'; <input type=datetime-local> wants 'YYYY-MM-DDTHH:MM'.
const toFrappe = (v: string) => (v ? v.replace('T', ' ') + (v.length === 16 ? ':00' : '') : '')

export default function BookingFormScreen() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [room, setRoom] = useState('')
  const [equipment, setEquipment] = useState<string[]>([])
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [err, setErr] = useState('')

  const rooms = (useRooms().data ?? []).filter((r) => r.is_active)
  const equip = (useEquipment().data ?? []).filter((e) => e.is_active)
  const check = useCheckAvailability()
  const create = useCreateBooking()

  async function submit() {
    setErr(''); setConflicts([])
    if (!title || !start || !end) { setErr('Title, Start and End are required.'); return }
    if (toFrappe(end) <= toFrappe(start)) { setErr('End must be after Start.'); return }
    try {
      const res = await check.mutateAsync({ start: toFrappe(start), end: toFrappe(end), room: room || undefined, equipment })
      if (res.conflicts.length) { setConflicts(res.conflicts); return }
      await create.mutateAsync({
        title, start: toFrappe(start), end: toFrappe(end),
        room: room || null, status: 'Confirmed',
        equipment: equipment.map((e) => ({ equipment: e })),
      })
      navigate('/bookings')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed.') }
  }

  return (
    <DetailScreen title="New booking">
      <div className="flex flex-col gap-4">
        <input className={field} placeholder="Title" value={title}
          onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-3">
          <label className="flex-1 text-xs font-semibold text-slate-500">Start
            <input type="datetime-local" className={field} value={start}
              onChange={(e) => setStart(e.target.value)} /></label>
          <label className="flex-1 text-xs font-semibold text-slate-500">End
            <input type="datetime-local" className={field} value={end}
              onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-slate-500">Room</legend>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="radio" name="room" checked={room === ''} onChange={() => setRoom('')}
                className="h-4 w-4 border-slate-300 accent-brand-600" />
              — None —
            </label>
            {rooms.map((r) => (
              <label key={r.name} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="radio" name="room" checked={room === r.name} onChange={() => setRoom(r.name)}
                  className="h-4 w-4 border-slate-300 accent-brand-600" />
                {r.room_name}
              </label>
            ))}
          </div>
        </fieldset>
        {equip.length > 0 && (
          <label className="text-xs font-semibold text-slate-500">Equipment
            <span className="mb-1 block font-normal text-slate-400">Hold Ctrl/Cmd to pick several</span>
            <select multiple size={Math.min(Math.max(equip.length, 3), 6)} className={field} value={equipment}
              onChange={(e) => setEquipment(Array.from(e.target.selectedOptions, (o) => o.value))}>
              {equip.map((e) => <option key={e.name} value={e.name}>{e.equipment_name}</option>)}
            </select>
          </label>
        )}
        {err && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{err}</p>
        )}
        {conflicts.length > 0 && (
          <div className="rounded-xl bg-rose-50 px-3 py-2 dark:bg-rose-900/30">
            <p className="mb-1 text-sm font-semibold text-rose-700 dark:text-rose-300">Conflicts:</p>
            {conflicts.map((c) => (
              <p key={`${c.booking}:${c.resource}`} className="text-xs text-rose-600 dark:text-rose-400">
                {c.resource_type} {c.resource} already booked {c.start}–{c.end} ({c.title})
              </p>
            ))}
          </div>
        )}
        <button onClick={submit} disabled={check.isPending || create.isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
          {(check.isPending || create.isPending) ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Book
        </button>
      </div>
    </DetailScreen>
  )
}

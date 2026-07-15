import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { Field } from '@web/components/ui'
import { DateTimePicker } from '@web/components/DatePicker'
import { useCreateBooking, useRooms, useEquipment, useCheckAvailability } from '@/hooks/useData'
import type { Conflict } from '@/lib/types'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

// Frappe stores 'YYYY-MM-DD HH:MM:SS'; <input type=datetime-local> wants 'YYYY-MM-DDTHH:MM'.
const toFrappe = (v: string) => (v ? v.replace('T', ' ') + (v.length === 16 ? ':00' : '') : '')

export default function BookingForm() {
  const navigate = useNavigate()
  const rooms = (useRooms().data ?? []).filter((r) => r.is_active)
  const equip = (useEquipment().data ?? []).filter((e) => e.is_active)
  const check = useCheckAvailability()
  const create = useCreateBooking()

  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [room, setRoom] = useState('')
  const [equipment, setEquipment] = useState<string[]>([])
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [err, setErr] = useState('')

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
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate('/bookings')}
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Bookings
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">New booking</h1>
      </div>

      {err && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
          {err}
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 space-y-1">
          <p className="font-semibold">Conflicts:</p>
          {conflicts.map((c) => (
            <p key={`${c.booking}:${c.resource}`}>{c.resource_type} {c.resource} already booked {c.start}–{c.end} ({c.title})</p>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4 max-w-lg">
        <Field label="Title" required>
          {(id) => (
            <input
              id={id}
              className={field}
              placeholder="Meeting title"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>

        <Field label="Start" required>
          {(id) => (
            <DateTimePicker
              id={id}
              className={field}
              value={start}
              onChange={(v) => setStart(v)}
            />
          )}
        </Field>

        <Field label="End" required>
          {(id) => (
            <DateTimePicker
              id={id}
              className={field}
              value={end}
              onChange={(v) => setEnd(v)}
            />
          )}
        </Field>

        <Field label="Room">
          {(id) => (
            <div id={id} className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                <input type="radio" name="room" checked={room === ''} onChange={() => setRoom('')} className="accent-brand-600" />
                — None —
              </label>
              {rooms.map((r) => (
                <label key={r.name} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input type="radio" name="room" checked={room === r.name} onChange={() => setRoom(r.name)} className="accent-brand-600" />
                  {r.room_name}
                </label>
              ))}
            </div>
          )}
        </Field>

        {equip.length > 0 && (
          <Field label="Equipment">
            {() => (
              <MultiSelectSearch
                options={equip.map((e) => ({ value: e.name, label: e.equipment_name }))}
                value={equipment}
                onChange={setEquipment}
                placeholder="Select equipment…"
              />
            )}
          </Field>
        )}

        <button
          type="submit"
          disabled={check.isPending || create.isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.99] transition disabled:opacity-60"
        >
          {(check.isPending || create.isPending) ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          Book
        </button>
      </form>
    </div>
  )
}

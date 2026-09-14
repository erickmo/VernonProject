import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { saveNetworks, type Station } from '@/lib/stations'

/** View/edit one station's Allowed Networks (dk0otn66u1). The state lives here so /w Stations
 *  and the /m stations screen behave the same; each renders its own editor. `draft` is null
 *  while not editing. */
export function useStationNetworks(station: Station) {
  const toast = useToast()
  const [value, setValue] = useState(station.allowed_networks || '')
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (draft === null || saving) return
    setSaving(true)
    try {
      setValue(await saveNetworks(station.name, draft))
      setDraft(null)
      toast('success', 'Allowed networks saved')
    } catch (e) {
      // Server validation ("Allowed Networks: … does not appear to be an IPv4 or IPv6 network") lands here.
      toast('error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return { value, draft, saving, setDraft, edit: () => setDraft(value), cancel: () => setDraft(null), save }
}

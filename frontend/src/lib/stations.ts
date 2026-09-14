// Attendance stations — shared by the /w Stations page and the /m stations screen (dk0otn66u1).

import { resource } from './api'

export type Station = {
  name: string
  station_name: string
  location?: string
  active: number
  display_key: string
  allowed_networks?: string | null
}

/** What both stations screens load per station. `allowed_networks` used to be missing, so
 *  there was nowhere to see or set the network a station's kiosk has to be on. */
export const STATION_FIELDS = ['name', 'station_name', 'location', 'active', 'display_key', 'allowed_networks']

/** Textarea → stored value: one IP or CIDR per line, blank lines dropped. The syntax itself is
 *  validated server-side (AttendanceStation.validate → qr.parse_networks). */
export function normalizeNetworks(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

/** Saves through the doctype's own write permission and validate() — no special endpoint. */
export async function saveNetworks(station: string, text: string): Promise<string> {
  const allowed_networks = normalizeNetworks(text)
  await resource.update('Attendance Station', station, { allowed_networks })
  return allowed_networks
}

/** The kiosk's network refusal ends with the IP the server saw — "…office network (203.0.113.7)".
 *  That is exactly what an admin adds to Allowed Networks, so a blocked screen shows it. */
export function networkFromError(message: string): string {
  return /\(([0-9a-f.:]+(?:\/\d+)?)\)\s*$/i.exec(message)?.[1] ?? ''
}

import { CalendarPlus } from 'lucide-react'
import { googleCalUrl } from '@/lib/googleCal'
import type { MeetingListItem } from '@/lib/types'

// One shared "Add to Google Calendar" link for every meeting surface (both frontends).
// Renders nothing for a Done meeting (past) or one with no start time.
export function showGoogleCal(meeting: MeetingListItem): boolean {
  return meeting.status !== '✅ Done' && googleCalUrl(meeting) !== null
}

export function GoogleCalButton({ meeting, className = '' }: { meeting: MeetingListItem; className?: string }) {
  if (!showGoogleCal(meeting)) return null
  const url = googleCalUrl(meeting)!
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 ${className}`}
    >
      <CalendarPlus className="h-4 w-4" /> Add to Google Calendar
    </a>
  )
}

import { useNavigate } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { CalendarView } from '@/components/CalendarView'

export default function Calendar() {
  const navigate = useNavigate()
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Calendar</h1>
        <button
          onClick={() => navigate('/meetings')}
          className="flex items-center gap-1.5 rounded-lg bg-brand-50 dark:bg-brand-500/15 px-3 py-2 text-sm font-semibold text-brand-700 dark:text-brand-300"
        >
          <CalendarClock className="h-4 w-4" /> Meetings
        </button>
      </div>
      <CalendarView fluid />
    </div>
  )
}

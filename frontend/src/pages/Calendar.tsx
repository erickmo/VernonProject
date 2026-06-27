import { useNavigate } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { CalendarView } from '@/components/CalendarView'

export default function Calendar() {
  const navigate = useNavigate()
  return (
    <DetailScreen
      title="Calendar"
      right={
        <button
          onClick={() => navigate('/meetings')}
          className="flex items-center gap-1 rounded-xl bg-brand-50 dark:bg-brand-500/15 px-3 py-1.5 text-sm font-semibold text-brand-700 dark:text-brand-300 active:scale-95"
        >
          <CalendarClock className="h-4 w-4" /> Meetings
        </button>
      }
    >
      <CalendarView />
    </DetailScreen>
  )
}

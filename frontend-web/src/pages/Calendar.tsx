import { useNavigate } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { Page, PageHeader } from '@web/components/Page'
import { Button } from '@web/components/ui'
import { CalendarView } from '@/components/CalendarView'

export default function Calendar() {
  const navigate = useNavigate()
  return (
    <Page>
      <PageHeader
        icon={CalendarClock}
        title="Calendar"
        subtitle="Tasks, meetings, bookings and deadlines in one view"
        actions={
          <Button variant="secondary" size="sm" onClick={() => navigate('/meetings')}>
            <CalendarClock className="h-4 w-4" /> Meetings
          </Button>
        }
      />
      {/* Frame the (shared) calendar grid in a soft-pop surface so it reads as one intentional panel */}
      <div className="rounded-2xl bg-surface p-3 shadow-card sm:p-5">
        <CalendarView fluid />
      </div>
    </Page>
  )
}

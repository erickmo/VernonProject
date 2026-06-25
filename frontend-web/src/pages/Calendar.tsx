import { CalendarView } from '@/components/CalendarView'

export default function Calendar() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Calendar</h1>
      <CalendarView fluid />
    </div>
  )
}

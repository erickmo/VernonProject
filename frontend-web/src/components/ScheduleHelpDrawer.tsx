import { Drawer } from '@web/components/overlays/Drawer'
import { SCHEDULE_HELP, SCHEDULE_HELP_TITLE } from '@/lib/scheduleHelp'

// Right-side slide-over explaining how shift templates + assignments work (Bahasa).
export function ScheduleHelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onClose={onClose} title={SCHEDULE_HELP_TITLE}>
      <div className="flex flex-col gap-5">
        {SCHEDULE_HELP.map((s) => (
          <div key={s.heading}>
            <p className="mb-1 text-sm font-semibold text-brand-700 dark:text-brand-300">{s.heading}</p>
            <ul className="flex flex-col gap-1.5">
              {s.points.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Drawer>
  )
}

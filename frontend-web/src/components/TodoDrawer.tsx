import { Drawer } from '@web/components/overlays/Drawer'
import ProjectItem from '@web/pages/ProjectItem'

// Renders the full todo detail page inside the app's right-side Drawer.
// Mounted by App.tsx under a <Route path="/project-item/:name">, so
// ProjectItem reads its id from useParams exactly as on the full page.
// closeOnEscape is false: ProjectItem hosts its own cancel/waiting/duplicate
// confirms whose Escape must close THEM, not this drawer.
export default function TodoDrawer({ onClose }: { onClose: () => void }) {
  return (
    <Drawer open onClose={onClose} title="Todo details" widthClass="max-w-2xl" closeOnEscape={false}>
      <ProjectItem />
    </Drawer>
  )
}

import { Drawer } from '@web/components/overlays/Drawer'
import ProjectItem from '@web/pages/ProjectItem'

// Renders the full todo detail page inside the app's right-side Drawer.
// Mounted by App.tsx under a <Route path="/project-item/:name">, so
// ProjectItem reads its id from useParams exactly as on the full page.
// Escape closes the drawer, but only when it's the top-most overlay: ProjectItem's
// confirms/pickers register in the shared modalStack, so their Escape closes THEM
// first and the drawer stays put underneath.
// zClass="z-40": sit below AppShell's z-50 full-screen overlays so Focus/⌘K/quick-create open ON TOP of the drawer, not behind it.
export default function TodoDrawer({ onClose }: { onClose: () => void }) {
  return (
    <Drawer open onClose={onClose} title="Todo details" widthClass="w-full sm:w-[75vw] max-w-none" zClass="z-40">
      <ProjectItem />
    </Drawer>
  )
}

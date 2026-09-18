import { Drawer } from '@web/components/overlays/Drawer'
import Certificate from '@web/pages/Certificate'

// Renders the full certificate form inside the app's right-side Drawer — the same
// mechanism TodoDrawer uses, mounted by App.tsx under <Route path="/certificates/:name">,
// so Certificate reads its id from useParams exactly as it does on the full page and a
// direct link still opens that page.
//
// Wide on purpose: at 75vw the scoring rows keep a criterion name, its weight and the
// score box on one line at any desktop width, which is the complaint this presentation
// was asked for. A narrow drawer would have made the captions worse, not better.
//
// zClass="z-40": sit below AppShell's z-50 full-screen overlays, so ⌘K and the quick
// actions open ON TOP of the drawer rather than behind it.
export default function CertificateDrawer({ onClose }: { onClose: () => void }) {
  return (
    <Drawer
      open
      onClose={onClose}
      title="Sertifikat"
      widthClass="w-full sm:w-[75vw] max-w-none"
      zClass="z-40"
      // The form hosts its own confirms (terbitkan / cabut) and pickers; their Escape
      // must close them, not this drawer. Close with the X or the scrim.
      closeOnEscape={false}
    >
      <Certificate />
    </Drawer>
  )
}

import { CERT_HELP } from '@/lib/certificate'
import { HelpSheet } from '@/components/HelpSheet'

// The certificate feature's binding of the shared (i) sheet. Kept as its own export so
// the certificate screens keep one import for their help copy.
export function CertificateHelpSheet({ term, onClose }: { term: string | null; onClose: () => void }) {
  return <HelpSheet entries={CERT_HELP} term={term} onClose={onClose} />
}

export { InfoDot } from '@/components/HelpSheet'

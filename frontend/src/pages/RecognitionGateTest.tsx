import { useNavigate } from 'react-router-dom'
import { useRecognitionGatePreview } from '../hooks/useData'
import DailyRecognitionGate from '../components/DailyRecognitionGate'
import { Spinner } from '../components/ui'

// System-Manager-only preview of the daily recognition gate, reachable from the admin
// menu. Uses the preview override (ignores the flag / membership / once-per-day) so the
// gate always shows populated, and passes onClose so it can be dismissed (unlike the real
// blocking mount). Submitting still casts real votes.
export default function RecognitionGateTest() {
  const navigate = useNavigate()
  const { data, isLoading } = useRecognitionGatePreview()

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-gradient-to-b from-brand-600 to-indigo-700">
        <Spinner className="h-6 w-6 text-white" />
      </div>
    )
  }

  if (!data?.owed || !data.assignee) {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-gradient-to-b from-brand-600 to-indigo-700 px-8 text-center">
        <div>
          <p className="text-lg font-bold text-white">Tidak ada rekan Internal Team untuk dinilai.</p>
          <p className="mt-1 text-sm text-white/80">
            Butuh minimal satu superpower aktif dan satu rekan Internal Team lain.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="mt-6 rounded-2xl bg-white px-6 py-3 font-bold text-brand-700 shadow-lg active:scale-95"
          >
            Kembali
          </button>
        </div>
      </div>
    )
  }

  return <DailyRecognitionGate gate={data} onClose={() => navigate(-1)} />
}

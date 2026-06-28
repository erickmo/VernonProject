import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { CheckCircle2, XCircle, QrCode } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useScanAttendance } from '@/hooks/useData'

type Result = { ok: boolean; title: string; detail: string }

const REGION_ID = 'qr-reader-region'

export default function Scan() {
  const scan = useScanAttendance()
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const qrRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    const qr = new Html5Qrcode(REGION_ID)
    qrRef.current = qr
    let stopped = false

    const onDecode = async (text: string) => {
      if (busy.current) return
      let payload: { station: string; counter: number; token: string }
      try {
        payload = JSON.parse(text)
      } catch {
        return // not our QR; keep scanning
      }
      if (!payload.station || payload.token == null) return
      busy.current = true
      try {
        const res = await scan.mutateAsync(payload)
        const d = res.daily
        const late = d?.late_minutes ?? 0
        const early = d?.early_minutes ?? 0
        const pen = d?.penalty_points ?? 0
        const bits: string[] = []
        if (late) bits.push(`late ${late} min`)
        if (early) bits.push(`left ${early} min early`)
        if (pen) bits.push(`−${pen} pts`)
        setResult({
          ok: true,
          title: d?.status === 'Present' ? 'Checked in · on time' : `Recorded · ${d?.status ?? ''}`,
          detail: bits.join(' · ') || 'No penalty',
        })
      } catch (e) {
        setResult({ ok: false, title: 'Scan failed', detail: (e as Error).message })
      } finally {
        // allow another scan after a short cooldown
        setTimeout(() => (busy.current = false), 1500)
      }
    }

    qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, onDecode, () => {})
      .catch((e) => setError(e?.message || 'Camera unavailable'))

    return () => {
      stopped = true
      qr.stop().then(() => qr.clear()).catch(() => {})
      void stopped
    }
  }, [scan])

  return (
    <DetailScreen title="Scan attendance">
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-2xl border border-paper-edge bg-black dark:border-slate-700">
          <div id={REGION_ID} className="aspect-square w-full" />
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
            {error}
          </div>
        )}

        {scan.isPending && (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Spinner className="h-4 w-4" /> Recording…
          </div>
        )}

        {result && (
          <div
            className={`animate-pop flex items-center gap-3 rounded-2xl border p-4 shadow-card ${
              result.ok
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/15'
                : 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/15'
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="h-7 w-7 shrink-0 text-rose-600" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-stone-800 dark:text-slate-100">{result.title}</p>
              <p className="text-sm text-stone-500 dark:text-slate-400">{result.detail}</p>
            </div>
          </div>
        )}

        <p className="flex items-center gap-2 text-xs text-stone-400">
          <QrCode className="h-4 w-4" /> Point the camera at the station screen. The code refreshes every few seconds.
        </p>
      </div>
    </DetailScreen>
  )
}

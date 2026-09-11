import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { CheckCircle2, XCircle, QrCode } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useScanAttendance } from '@/hooks/useData'
import { seenRange } from '@/lib/format'

type Result = { ok: boolean; title: string; detail: string }

const REGION_ID = 'qr-reader-region'

export default function Scan() {
  const scan = useScanAttendance()
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const lastText = useRef('')
  const qrRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    const qr = new Html5Qrcode(REGION_ID)
    qrRef.current = qr

    const onDecode = async (text: string) => {
      // The camera decodes the same code ~10×/s; the kiosk only changes it each QR window,
      // so one request per code keeps a burst to one server call (the server dedupes too).
      if (busy.current || text === lastText.current) return
      let payload: { station: string; counter: number; token: string }
      try {
        payload = JSON.parse(text)
      } catch {
        return // not our QR; keep scanning
      }
      if (!payload.station || payload.token == null) return
      lastText.current = text
      busy.current = true
      try {
        const res = await scan.mutateAsync(payload)
        const d = res.daily
        const late = d?.late_minutes ?? 0
        const early = d?.early_minutes ?? 0
        const pen = d?.penalty_points ?? 0
        const bits: string[] = []
        if (d?.first_scan) bits.push(`seen ${seenRange(d.first_scan, d.last_scan)}`)
        if (late) bits.push(`late ${late} min`)
        if (early) bits.push(`left ${early} min early`)
        if (pen) bits.push(`−${pen} pts`)
        setResult({
          ok: true,
          title: res.duplicate ? 'Already recorded' : `Seen at ${d?.station_last ?? payload.station}`,
          detail: bits.join(' · '),
        })
      } catch (e) {
        const offline = typeof navigator !== 'undefined' && !navigator.onLine
        setResult({
          ok: false,
          title: 'Scan failed',
          detail: offline
            ? 'You are offline. Reconnect, then scan the next code.'
            : String(e instanceof Error ? e.message : e),
        })
      } finally {
        // allow another scan after a short cooldown
        setTimeout(() => (busy.current = false), 1500)
      }
    }

    qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, onDecode, () => {})
      .catch((e) => setError(e?.message || 'Camera unavailable'))

    return () => {
      qr.stop().then(() => qr.clear()).catch(() => {})
    }
    // ponytail: scan.mutateAsync is stable; [scan] restarted the camera on every mutation tick (stop/start race)
  }, [])

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
          <QrCode className="h-4 w-4" /> Point the camera at the station screen. Your first scan of the day is your
          first seen, the latest is your last seen.
        </p>
      </div>
    </DetailScreen>
  )
}

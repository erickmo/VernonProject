import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { mobileApi } from '@/lib/api'

export default function Kiosk() {
  const { station = '' } = useParams()
  const [params] = useSearchParams()
  const key = params.get('key') || ''
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stationName, setStationName] = useState(station)

  useEffect(() => {
    let alive = true
    let timer: number

    const tick = async () => {
      try {
        const payload = await mobileApi.stationToken(station, key)
        if (!alive) return
        setStationName(payload.station)
        if (canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, JSON.stringify(payload), { width: 320, margin: 1 })
        }
        setError(null)
      } catch (e) {
        if (alive) setError((e as Error).message || 'Station error')
      }
      // re-poll a bit faster than the validity window so the code never goes stale on screen
      if (alive) timer = window.setTimeout(tick, 5000)
    }
    tick()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [station, key])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 text-white">
      <h1 className="text-3xl font-bold">{stationName}</h1>
      {error ? (
        <p className="text-rose-400">{error}</p>
      ) : (
        <div className="rounded-2xl bg-white p-4">
          <canvas ref={canvasRef} />
        </div>
      )}
      <p className="text-sm text-muted">Scan with the Vernon app to check in / out</p>
    </div>
  )
}

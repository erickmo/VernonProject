import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { mobileApi } from '@/lib/api'
import { networkFromError } from '@/lib/stations'

export default function Kiosk() {
  const { station = '' } = useParams()
  const [params] = useSearchParams()
  const key = params.get('key') || ''
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stationName, setStationName] = useState(station)
  const [network, setNetwork] = useState('')

  useEffect(() => {
    let alive = true
    let timer: number

    const tick = async () => {
      try {
        const payload = await mobileApi.stationToken(station, key)
        if (!alive) return
        setStationName(payload.station)
        setNetwork(payload.network || '')
        if (canvasRef.current) {
          // only what the scan needs goes in the QR: no key, no network, no personal data
          const { station: s, counter, token } = payload
          await QRCode.toCanvas(canvasRef.current, JSON.stringify({ station: s, counter, token }), { width: 320, margin: 1 })
        }
        setError(null)
      } catch (e) {
        if (alive) {
          const message = (e as Error).message || 'Station error'
          setError(message)
          // A network refusal names the IP the server saw — show it so an admin can allow it.
          const ip = networkFromError(message)
          if (ip) setNetwork(ip)
        }
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
        <div className="max-w-md text-center">
          <p className="text-rose-400">{error}</p>
          {network && (
            <p className="mt-2 text-sm text-slate-400">
              Add this network to the station&apos;s Allowed networks on the Stations page, then this screen retries on its own.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-4">
          <canvas ref={canvasRef} />
        </div>
      )}
      <p className="text-sm text-muted">Scan with the Vernon app when you arrive and when you leave</p>
      {/* the screen's own public IP — what an admin puts in the station's Allowed Networks */}
      {network && <p className="text-xs text-slate-500">Network {network}</p>}
    </div>
  )
}

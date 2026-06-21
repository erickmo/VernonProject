// Coffeeshop ambience for focus mode, synthesized live with the Web Audio API —
// no audio files, works fully offline, no licensing. It layers:
//   • room tone   — soft brown-noise warmth (the low hum of a room)
//   • murmur      — band-passed noise swelling slowly, like distant chatter
//   • espresso    — a faint high hiss bed (machine / steam)
//   • cup clinks  — short randomized pings every few seconds
// It approximates a café; it is not a recording.

let ctx: AudioContext | null = null
function getCtx(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
  }
  return ctx
}

// Generate a looping noise buffer. Brown noise integrates white noise for a
// softer, bass-heavy character; otherwise plain white noise.
function noiseBuffer(c: AudioContext, brown: boolean): AudioBuffer {
  const len = c.sampleRate * 3
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * white) / 1.02
      d[i] = last * 3.5
    } else {
      d[i] = white
    }
  }
  return buf
}

class AmbientEngine {
  private master: GainNode | null = null
  private nodes: AudioNode[] = []
  private srcs: AudioScheduledSourceNode[] = []
  private clinkTimer: ReturnType<typeof setTimeout> | null = null
  volume = 0.4
  playing = false

  private teardown() {
    if (this.clinkTimer) {
      clearTimeout(this.clinkTimer)
      this.clinkTimer = null
    }
    for (const s of this.srcs) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    for (const n of this.nodes) {
      try {
        n.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.srcs = []
    this.nodes = []
    this.master = null
  }

  private layerNoise(c: AudioContext, out: GainNode, opts: { brown?: boolean; type: BiquadFilterType; freq: number; q?: number; gain: number }) {
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, !!opts.brown)
    src.loop = true
    const filter = c.createBiquadFilter()
    filter.type = opts.type
    filter.frequency.value = opts.freq
    if (opts.q != null) filter.Q.value = opts.q
    const g = c.createGain()
    g.gain.value = opts.gain
    src.connect(filter).connect(g).connect(out)
    src.start()
    this.srcs.push(src)
    this.nodes.push(filter, g)
    return g
  }

  private buildCoffeeshop(c: AudioContext, out: GainNode) {
    // Warm room tone.
    this.layerNoise(c, out, { brown: true, type: 'lowpass', freq: 400, gain: 0.55 })

    // Chatter murmur — band-passed noise that swells with two slow LFOs.
    const murmur = this.layerNoise(c, out, { type: 'bandpass', freq: 900, q: 0.7, gain: 0.22 })
    for (const [rate, depth] of [[0.13, 0.1], [0.07, 0.07]] as const) {
      const lfo = c.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = rate
      const lg = c.createGain()
      lg.gain.value = depth
      lfo.connect(lg).connect(murmur.gain)
      lfo.start()
      this.srcs.push(lfo)
      this.nodes.push(lg)
    }

    // Faint espresso/steam hiss.
    this.layerNoise(c, out, { type: 'highpass', freq: 4500, gain: 0.025 })

    // Random cup clinks.
    this.scheduleClink(c, out)
  }

  private scheduleClink(c: AudioContext, out: GainNode) {
    const delay = 2500 + Math.random() * 6500
    this.clinkTimer = setTimeout(() => {
      this.spawnClink(c, out)
      if (this.playing) this.scheduleClink(c, out)
    }, delay)
  }

  private spawnClink(c: AudioContext, out: GainNode) {
    const now = c.currentTime
    const osc = c.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = 1600 + Math.random() * 1000
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.06, now + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
    osc.connect(g).connect(out)
    osc.start(now)
    osc.stop(now + 0.32)
  }

  async play() {
    const c = getCtx()
    try {
      await c.resume()
    } catch {
      /* resume may reject if not yet allowed; gesture-driven calls succeed */
    }
    this.teardown()

    const master = c.createGain()
    master.gain.setValueAtTime(0, c.currentTime)
    master.connect(c.destination)
    this.master = master
    this.nodes.push(master)
    this.playing = true

    this.buildCoffeeshop(c, master)

    // Gentle fade-in to avoid a click.
    master.gain.linearRampToValueAtTime(this.volume, c.currentTime + 1.5)
  }

  setVolume(v: number) {
    this.volume = v
    if (this.master) this.master.gain.setTargetAtTime(v, getCtx().currentTime, 0.1)
  }

  stop() {
    if (this.master) {
      const c = getCtx()
      this.master.gain.cancelScheduledValues(c.currentTime)
      this.master.gain.setTargetAtTime(0, c.currentTime, 0.15)
    }
    this.playing = false
    if (this.clinkTimer) {
      clearTimeout(this.clinkTimer)
      this.clinkTimer = null
    }
    setTimeout(() => this.teardown(), 400)
  }
}

export const ambient = new AmbientEngine()

// ---- persisted user preferences ----

const PREF_KEY = 'vernon.focusSound'
export type SoundPrefs = { enabled: boolean; volume: number }
const DEFAULT_PREFS: SoundPrefs = { enabled: false, volume: 0.4 }

export function loadSoundPrefs(): SoundPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<SoundPrefs>) }
  } catch {
    return DEFAULT_PREFS
  }
}

export function saveSoundPrefs(p: SoundPrefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

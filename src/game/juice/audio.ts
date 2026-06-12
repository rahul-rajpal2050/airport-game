import { CONFIG } from '../../config'

// All sounds are synthesized — no asset files. Each is a short envelope on
// oscillators/noise through a master gain.

let audioCtx: AudioContext | null = null
let master: GainNode | null = null

/** Must be called from a user gesture (autoplay policy) — wired to START SHIFT */
export function initAudio(): void {
  if (!audioCtx) {
    audioCtx = new AudioContext()
    master = audioCtx.createGain()
    master.gain.value = CONFIG.juice.masterVolume
    master.connect(audioCtx.destination)
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume()
}

function tone(
  freq: number,
  durationMs: number,
  type: OscillatorType,
  volume: number,
  glideToFreq?: number
): void {
  if (!audioCtx || !master) return
  const t0 = audioCtx.currentTime
  const t1 = t0 + durationMs / 1000
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (glideToFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(glideToFreq, t1)
  gain.gain.setValueAtTime(volume, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t1)
  osc.connect(gain).connect(master)
  osc.start(t0)
  osc.stop(t1)
}

function makeNoiseSource(durationMs: number): AudioBufferSourceNode | null {
  if (!audioCtx) return null
  const length = Math.ceil((audioCtx.sampleRate * durationMs) / 1000)
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  // deterministic pseudo-noise — sounds identical to white noise, keeps the
  // no-Math.random rule trivially intact
  let s = 1
  for (let i = 0; i < length; i++) {
    s = (s * 16807) % 2147483647
    data[i] = (s / 2147483647) * 2 - 1
  }
  const src = audioCtx.createBufferSource()
  src.buffer = buffer
  return src
}

interface NoiseShape {
  durationMs: number
  volume: number
  filterType?: BiquadFilterType
  filterFrom: number
  filterTo?: number
  /** gain envelope: rise to volume over attackMs, then decay to silence */
  attackMs?: number
}

/** Filtered noise with optional filter sweep and attack — the basis of every "real" sound */
function noiseLayer(shape: NoiseShape): void {
  if (!audioCtx || !master) return
  const src = makeNoiseSource(shape.durationMs)
  if (!src) return
  const t0 = audioCtx.currentTime
  const t1 = t0 + shape.durationMs / 1000
  const filter = audioCtx.createBiquadFilter()
  filter.type = shape.filterType ?? 'lowpass'
  filter.frequency.setValueAtTime(shape.filterFrom, t0)
  if (shape.filterTo !== undefined) filter.frequency.exponentialRampToValueAtTime(shape.filterTo, t1)
  const gain = audioCtx.createGain()
  if (shape.attackMs) {
    gain.gain.setValueAtTime(0.001, t0)
    gain.gain.exponentialRampToValueAtTime(shape.volume, t0 + shape.attackMs / 1000)
  } else {
    gain.gain.setValueAtTime(shape.volume, t0)
  }
  gain.gain.exponentialRampToValueAtTime(0.001, t1)
  src.connect(filter).connect(gain).connect(master)
  src.start(t0)
}

function noiseBurst(durationMs: number, volume: number, filterFreq: number): void {
  noiseLayer({ durationMs, volume, filterFrom: filterFreq })
}

/** Landing: touchdown thump + tire screech (band-passed noise sweeping down) */
export function playThunk(): void {
  tone(85, 180, 'sine', 0.9, 40)              // airframe thump
  noiseLayer({ durationMs: 450, volume: 0.4, filterType: 'bandpass', filterFrom: 1900, filterTo: 500 }) // tires
  noiseBurst(150, 0.4, 500)                   // dust/spoilers
}

/** Near-miss: filtered noise whoosh + rising ping */
export function playWhoosh(): void {
  noiseBurst(320, 0.6, 2400)
  tone(880, 250, 'sine', 0.25, 1320)
}

/** Diversion: harsh two-tone alarm */
export function playAlarm(): void {
  tone(440, 140, 'square', 0.35)
  setTimeout(() => tone(330, 220, 'square', 0.35), 150)
}

/** Takeoff: ~3s jet spool — noise sweeping up through a lowpass, sub-rumble under it, fading as the plane climbs away */
export function playTakeoff(): void {
  // engine spool: filter opens as thrust builds, long tail as it departs
  noiseLayer({ durationMs: 3000, volume: 0.55, filterFrom: 180, filterTo: 2600, attackMs: 900 })
  // turbine whine riding on top
  noiseLayer({ durationMs: 2600, volume: 0.12, filterType: 'bandpass', filterFrom: 1400, filterTo: 3400, attackMs: 700 })
  // airframe sub-rumble, pitch falling at the end (doppler as it climbs out)
  tone(48, 2800, 'sawtooth', 0.35, 30)
}

/** New arrival on frequency: radio squelch + short readback tone */
export function playRadioBlip(): void {
  noiseLayer({ durationMs: 70, volume: 0.18, filterType: 'highpass', filterFrom: 2400 })
  setTimeout(() => tone(1150, 70, 'square', 0.08), 75)
}

/** Turnaround done: friendly two-note chime */
export function playChime(): void {
  tone(660, 120, 'sine', 0.3)
  setTimeout(() => tone(990, 180, 'sine', 0.3), 110)
}

/** Patience hit zero: low buzz */
export function playBuzz(): void {
  tone(110, 280, 'square', 0.35, 80)
}

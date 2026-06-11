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

function noiseBurst(durationMs: number, volume: number, filterFreq: number): void {
  if (!audioCtx || !master) return
  const t0 = audioCtx.currentTime
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
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = filterFreq
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(volume, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + durationMs / 1000)
  src.connect(filter).connect(gain).connect(master)
  src.start(t0)
}

/** Landing: low thunk + tire-noise burst */
export function playThunk(): void {
  tone(90, 160, 'sine', 0.9, 45)
  noiseBurst(120, 0.5, 600)
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

/** Takeoff: rising rumble */
export function playTakeoff(): void {
  tone(60, 600, 'sawtooth', 0.5, 140)
  noiseBurst(500, 0.25, 400)
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

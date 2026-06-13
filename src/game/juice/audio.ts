import { CONFIG } from '../../config'

// All sounds are synthesized — no asset files. Voices feed a shared bus that
// fans out to a dry path and a reverb send, then through a compressor: the
// reverb + compression are what stop it sounding like dry chiptune beeps.

let audioCtx: AudioContext | null = null
let bus: GainNode | null = null // every voice connects here

/** Code-generated impulse response: decaying stereo noise = a small room */
function makeReverbIR(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    let s = ch === 0 ? 1 : 9973 // distinct deterministic seed per channel
    for (let i = 0; i < len; i++) {
      s = (s * 16807) % 2147483647
      const noise = (s / 2147483647) * 2 - 1
      data[i] = noise * Math.pow(1 - i / len, 2.6) // exponential decay
    }
  }
  return ir
}

/** Must be called from a user gesture (autoplay policy) — wired to START SHIFT */
export function initAudio(): void {
  if (!audioCtx) {
    audioCtx = new AudioContext()
    bus = audioCtx.createGain()

    const master = audioCtx.createGain()
    master.gain.value = CONFIG.juice.masterVolume
    const comp = audioCtx.createDynamicsCompressor() // glue + tames peaks
    master.connect(comp).connect(audioCtx.destination)

    // dry path
    bus.connect(master)
    // reverb send: a fraction of the bus through a convolver for air/space
    const convolver = audioCtx.createConvolver()
    convolver.buffer = makeReverbIR(audioCtx, 1.2)
    const send = audioCtx.createGain()
    send.gain.value = 0.28
    bus.connect(send).connect(convolver).connect(master)
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume()
}

interface ToneOpts {
  type?: OscillatorType
  glideToFreq?: number
  attackMs?: number   // soft attack instead of a hard click
  detune?: number     // pair a second osc this many cents away = warmth
}

function tone(freq: number, durationMs: number, volume: number, opts: ToneOpts = {}): void {
  if (!audioCtx || !bus) return
  const t0 = audioCtx.currentTime
  const t1 = t0 + durationMs / 1000
  const gain = audioCtx.createGain()
  const attack = (opts.attackMs ?? 8) / 1000
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(volume, t0 + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t1)
  gain.connect(bus)

  const detunes = opts.detune ? [-opts.detune, opts.detune] : [0]
  for (const d of detunes) {
    const osc = audioCtx.createOscillator()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, t0)
    if (opts.glideToFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(opts.glideToFreq, t1)
    osc.detune.value = d
    osc.connect(gain)
    osc.start(t0)
    osc.stop(t1)
  }
}

/** Soft saturation curve — adds harmonic grit without the harshness of square waves */
function rasp(): WaveShaperNode | null {
  if (!audioCtx) return null
  const n = 256
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * 2.2)
  }
  const ws = audioCtx.createWaveShaper()
  ws.curve = curve
  return ws
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
  if (!audioCtx || !bus) return
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
  src.connect(filter).connect(gain).connect(bus)
  src.start(t0)
}

function noiseBurst(durationMs: number, volume: number, filterFreq: number): void {
  noiseLayer({ durationMs, volume, filterFrom: filterFreq })
}

/** Landing: airframe thump + tire screech (band-passed noise sweeping down) */
export function playThunk(): void {
  tone(85, 200, 0.85, { glideToFreq: 38, attackMs: 4 }) // airframe thump
  noiseLayer({ durationMs: 480, volume: 0.38, filterType: 'bandpass', filterFrom: 1900, filterTo: 480 }) // tires
  noiseBurst(160, 0.35, 480)                   // dust/spoilers
}

/** Near-miss: airy whoosh + rising swell */
export function playWhoosh(): void {
  noiseLayer({ durationMs: 360, volume: 0.5, filterType: 'bandpass', filterFrom: 700, filterTo: 2600, attackMs: 120 })
  tone(700, 300, 0.18, { type: 'triangle', glideToFreq: 1180, attackMs: 60 })
}

/** Event fires / diversion: detuned saw alarm through a bandpass — urgent, not chiptune */
export function playAlarm(): void {
  alarmHit(460)
  setTimeout(() => alarmHit(360), 170)
}
function alarmHit(freq: number): void {
  if (!audioCtx || !bus) return
  const t0 = audioCtx.currentTime
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq * 3
  filter.Q.value = 4
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
  filter.connect(gain).connect(bus)
  for (const d of [-8, 8]) {
    const osc = audioCtx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    osc.detune.value = d
    osc.connect(filter)
    osc.start(t0)
    osc.stop(t0 + 0.24)
  }
}

/** Takeoff: ~3s jet roar — brown-ish noise spool with a wobble and combustion rasp */
export function playTakeoff(): void {
  if (!audioCtx || !bus) return
  const t0 = audioCtx.currentTime
  const dur = 3.2
  const src = makeNoiseSource(dur * 1000)
  if (!src) return
  // cascade two lowpasses for a darker, browner roar than a single filter
  const lp1 = audioCtx.createBiquadFilter()
  lp1.type = 'lowpass'
  lp1.frequency.setValueAtTime(150, t0)
  lp1.frequency.exponentialRampToValueAtTime(2200, t0 + 1.0)
  lp1.frequency.exponentialRampToValueAtTime(900, t0 + dur)
  const lp2 = audioCtx.createBiquadFilter()
  lp2.type = 'lowpass'
  lp2.frequency.value = 3000
  const shaper = rasp()!
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.6, t0 + 1.0)
  gain.gain.setValueAtTime(0.6, t0 + dur - 1.0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  // slow amplitude wobble (engine surge)
  const lfo = audioCtx.createOscillator()
  const lfoGain = audioCtx.createGain()
  lfo.frequency.value = 6
  lfoGain.gain.value = 0.08
  lfo.connect(lfoGain).connect(gain.gain)
  src.connect(lp1).connect(lp2).connect(shaper).connect(gain).connect(bus)
  src.start(t0)
  lfo.start(t0)
  lfo.stop(t0 + dur)
  // sub-rumble underneath, pitch falling as it climbs out
  tone(46, dur * 1000 - 300, 0.3, { type: 'sawtooth', glideToFreq: 28, attackMs: 400 })
}

/** New arrival on frequency: short radio squelch (noise only — no beep) */
export function playRadioBlip(): void {
  noiseLayer({ durationMs: 90, volume: 0.12, filterType: 'bandpass', filterFrom: 1800, filterTo: 2600, attackMs: 10 })
}

/** Turnaround done: soft detuned two-note chime */
export function playChime(): void {
  tone(660, 160, 0.26, { type: 'sine', detune: 5, attackMs: 20 })
  setTimeout(() => tone(990, 240, 0.26, { type: 'sine', detune: 5, attackMs: 20 }), 120)
}

/** Patience hit zero: filtered saw growl */
export function playBuzz(): void {
  if (!audioCtx || !bus) return
  const t0 = audioCtx.currentTime
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 600
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.3, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35)
  filter.connect(gain).connect(bus)
  for (const d of [-12, 12]) {
    const osc = audioCtx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(120, t0)
    osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.35)
    osc.detune.value = d
    osc.connect(filter)
    osc.start(t0)
    osc.stop(t0 + 0.36)
  }
}

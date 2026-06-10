import { CONFIG } from '../config'
import { rng } from '../utils/rng'
import { attachInput } from './input'
import { draw } from './render'
import { simulate } from './sim'
import { gameStore, newStats, type GameState } from './state'
import { generateSchedule, resetPlaneIds } from './systems/spawn'
import { Gate } from './entities/gate'
import { Runway } from './entities/runway'

const { width: LOGICAL_W, height: LOGICAL_H } = CONFIG.canvas

let rafId = 0
let lastTime = 0
let canvas: HTMLCanvasElement
let ctx: CanvasRenderingContext2D
let detachInput: (() => void) | null = null

let state: GameState = makeIdleState()

function makeIdleState(): GameState {
  return {
    phase: 'pre_shift',
    seed: rng.seed,
    shiftTime: 0,
    timeScale: 1,
    planes: [],
    runways: [],
    gates: [],
    schedule: [],
    scheduleIndex: 0,
    events: [],
    stats: newStats(),
    selectedPlaneId: null,
    streak: 0,
    slowMoMs: 0,
    nearMissPairs: new Map(),
  }
}

export function getState(): GameState {
  return state
}

export function startShift(seed: number | string): void {
  rng.reseed(seed)
  resetPlaneIds()
  state = makeIdleState()
  state.seed = seed
  state.runways = CONFIG.runway.positions
    .slice(0, CONFIG.runway.count)
    .map((p, i) => new Runway(i, p.x, p.y, p.angle))
  state.gates = Array.from({ length: CONFIG.gate.count }, (_, i) => new Gate(i))
  state.schedule = generateSchedule(rng)
  state.phase = 'active'
  gameStore.notify()
}

function endShift(): void {
  state.phase = 'post_shift'
  state.stats.leftInAir = state.planes.filter((p) => p.isAirborneControllable).length
  state.selectedPlaneId = null
  gameStore.notify()
}

function update(dt: number): void {
  if (state.phase !== 'active') return
  let scale = state.timeScale
  if (state.slowMoMs > 0) {
    state.slowMoMs = Math.max(0, state.slowMoMs - dt * 1000) // wall-clock countdown
    scale *= CONFIG.nearMiss.slowMoFactor
  }
  if (simulate(state, dt * scale)) endShift()
}

function resize(): void {
  const scale = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H)
  const cssW = Math.floor(LOGICAL_W * scale)
  const cssH = Math.floor(LOGICAL_H * scale)
  const dpr = window.devicePixelRatio || 1

  canvas.width = cssW * dpr
  canvas.height = cssH * dpr
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale((cssW * dpr) / LOGICAL_W, (cssH * dpr) / LOGICAL_H)
}

function loop(timestamp: number): void {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1)
  lastTime = timestamp
  update(dt)
  draw(ctx, state)
  rafId = requestAnimationFrame(loop)
}

export function startLoop(el: HTMLCanvasElement): void {
  canvas = el
  ctx = canvas.getContext('2d')!
  resize()
  window.addEventListener('resize', resize)
  detachInput = attachInput(canvas, getState)
  lastTime = performance.now()
  rafId = requestAnimationFrame(loop)

  if (import.meta.env.DEV) {
    // dev console handle for feel-tuning: __game.getState().timeScale = 4, etc.
    ;(window as unknown as Record<string, unknown>).__game = { getState, startShift }
  }
}

export function stopLoop(): void {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
  detachInput?.()
  detachInput = null
}

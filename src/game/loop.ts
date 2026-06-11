import { CONFIG, identityModifiers, type Modifiers, type ShiftArchetype } from '../config'
import { rng } from '../utils/rng'
import { attachInput } from './input'
import { draw } from './render'
import { applyJuice } from './juice/juice'
import { simulate } from './sim'
import { gameStore, newGameState, type GameState } from './state'
import { generateEventSchedule, resolveEvent, rollRiskLottery } from './systems/events'
import { generateSchedule, resetPlaneIds } from './systems/spawn'
import { Gate } from './entities/gate'
import { Runway } from './entities/runway'

const { width: LOGICAL_W, height: LOGICAL_H } = CONFIG.canvas

let rafId = 0
let lastTime = 0
let canvas: HTMLCanvasElement
let ctx: CanvasRenderingContext2D
let detachInput: (() => void) | null = null

let state: GameState = newGameState(rng.seed)

export function getState(): GameState {
  return state
}

export interface ShiftOptions {
  modifiers?: Modifiers
  archetype?: ShiftArchetype
  hudReputation?: number
}

export function startShift(seed: number | string, options?: ShiftOptions): void {
  rng.reseed(seed)
  resetPlaneIds()
  state = newGameState(seed)
  state.modifiers = options?.modifiers ?? identityModifiers()
  state.hudReputation = options?.hudReputation ?? null
  const archetype = options?.archetype

  const runwayCount = Math.min(
    CONFIG.runway.count + state.modifiers.extraRunways,
    CONFIG.runway.positions.length
  )
  state.runways = CONFIG.runway.positions
    .slice(0, runwayCount)
    .map((p, i) => new Runway(i, p.x, p.y, p.angle))
  for (const closedId of archetype?.closedRunways ?? []) {
    const runway = state.runways[closedId]
    if (runway) runway.closedUntil = Infinity
  }
  const gateCount = CONFIG.gate.count + state.modifiers.extraGates
  state.gates = Array.from({ length: gateCount }, (_, i) => new Gate(i, gateCount))

  // fixed RNG draw order — the determinism contract: spawns, then events, then lottery
  state.schedule = generateSchedule(rng, archetype?.spawnRateMult ?? 1)
  state.eventSchedule = generateEventSchedule(rng, {
    count: archetype?.eventCount,
    forced: archetype?.forcedEvents,
  })
  state.riskRolls = rollRiskLottery(rng)
  state.phase = 'active'
  gameStore.notify()
}

let shiftEndHandler: ((stats: GameState['stats']) => void) | null = null

/** Campaign layer registers here; the sim stays campaign-agnostic */
export function onShiftEnd(handler: (stats: GameState['stats']) => void): void {
  shiftEndHandler = handler
}

function endShift(): void {
  state.phase = 'post_shift'
  state.stats.leftInAir = state.planes.filter((p) => p.isAirborneControllable).length
  state.selectedPlaneId = null
  shiftEndHandler?.(state.stats)
  gameStore.notify()
}

/** Back to the pre-shift menu (campaign summary dismissed, etc.) */
export function returnToMenu(): void {
  state = newGameState(rng.seed)
  gameStore.notify()
}

function update(dt: number): void {
  if (state.shakeMs > 0) state.shakeMs = Math.max(0, state.shakeMs - dt * 1000)
  if (state.phase !== 'active') return

  const prevPending = state.pendingEvent
  let scale = state.timeScale
  if (state.slowMoMs > 0) {
    state.slowMoMs = Math.max(0, state.slowMoMs - dt * 1000) // wall-clock countdown
    scale *= CONFIG.nearMiss.slowMoFactor
  }
  if (state.pendingEvent) {
    scale *= CONFIG.events.eventSlowMoFactor
    state.pendingEvent.autoResolveMsLeft -= dt * 1000 // wall-clock decision pressure
    if (state.pendingEvent.autoResolveMsLeft <= 0) resolveEvent(state, 0)
  }

  if (simulate(state, dt * scale)) endShift()
  applyJuice(state)

  // dialog opened, closed, or swapped this frame -> single React render
  if (state.pendingEvent !== prevPending) gameStore.notify()
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

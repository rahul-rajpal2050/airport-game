import { identityModifiers, type Modifiers } from '../config'
import type { FrameEvent, Plane, PlaneKind } from './entities/plane'
import type { Gate } from './entities/gate'
import type { Runway } from './entities/runway'
import type { ActiveEffect, PendingEvent, ScheduledEvent } from './systems/events'
import type { SpawnEntry } from './systems/spawn'

export type ShiftPhase = 'pre_shift' | 'active' | 'post_shift'

export interface ShiftStats {
  landed: number
  arrivedOnTime: number
  departed: number
  departedOnTime: number
  diverted: number
  raged: number
  leftInAir: number
  rerouted: number
  nearMisses: number
  bestStreak: number
  longestHoldSeconds: number
  longestHoldCallsign: string
  worstDelaySeconds: number
  worstDelayCallsign: string
  /** set when a plane ran dry circling — the shift ends immediately */
  gameOverCallsign: string
  score: number
}

export interface GameState {
  phase: ShiftPhase
  seed: number | string
  shiftTime: number
  timeScale: number
  planes: Plane[]
  runways: Runway[]
  gates: Gate[]
  schedule: SpawnEntry[]
  scheduleIndex: number
  events: FrameEvent[]
  /** last tick's events, handed to the juice layer (sound/shake) by the loop */
  juiceEvents: FrameEvent[]
  stats: ShiftStats
  selectedPlaneId: number | null
  /** consecutive near-misses without a failure; resets on diverted/raged */
  streak: number
  /** remaining slow-motion time (wall-clock ms); loop applies slowMoFactor while > 0 */
  slowMoMs: number
  /** screen shake state (wall-clock ms); render reads, loop ticks down */
  shakeMs: number
  shakeDurationMs: number
  shakeIntensity: number
  /** last near-miss shiftTime per plane pair, for the cooldown */
  nearMissPairs: Map<string, number>
  /** pre-rolled event schedule (seeded) and fire cursor */
  eventSchedule: ScheduledEvent[]
  eventIndex: number
  /** open event dialog, if any; deep slow-mo while set */
  pendingEvent: PendingEvent | null
  /** timed effect modifiers from event choices */
  activeEffects: ActiveEffect[]
  /** pre-rolled floats consumed by go-around checks (determinism) */
  riskRolls: number[]
  riskIndex: number
  /** next spawn gets this kind (vip marking) */
  nextSpawnKind: PlaneKind | null
  /** red carpet chosen before the VIP spawned: it queue-jumps on arrival */
  vipPriority: boolean
  /** next landing's rollout duration multiplier (bird strike) */
  nextRolloutMult: number
  /** perk modifiers for this shift (identity when no perks) */
  modifiers: Modifiers
  /** campaign reputation shown in the HUD, null in free-shift mode */
  hudReputation: number | null
  /** settings toggle: near-miss detection (slow-mo, streaks) */
  nearMissesEnabled: boolean
  /** transient HUD warning (size-rule violations); msLeft ticks on wall-clock */
  warning: { text: string; msLeft: number } | null
  /** everything freezes while true; rendering continues */
  paused: boolean
  /** fog "close one runway" is awaiting the player's runway click */
  runwayPick: { durationSeconds: number } | null
}

export function newGameState(seed: number | string): GameState {
  return {
    phase: 'pre_shift',
    seed,
    shiftTime: 0,
    timeScale: 1,
    planes: [],
    runways: [],
    gates: [],
    schedule: [],
    scheduleIndex: 0,
    events: [],
    juiceEvents: [],
    stats: newStats(),
    selectedPlaneId: null,
    streak: 0,
    slowMoMs: 0,
    shakeMs: 0,
    shakeDurationMs: 0,
    shakeIntensity: 0,
    nearMissPairs: new Map(),
    eventSchedule: [],
    eventIndex: 0,
    pendingEvent: null,
    activeEffects: [],
    riskRolls: [],
    riskIndex: 0,
    nextSpawnKind: null,
    vipPriority: false,
    nextRolloutMult: 1,
    modifiers: identityModifiers(),
    hudReputation: null,
    nearMissesEnabled: true,
    warning: null,
    paused: false,
    runwayPick: null,
  }
}

export function newStats(): ShiftStats {
  return {
    landed: 0,
    arrivedOnTime: 0,
    departed: 0,
    departedOnTime: 0,
    diverted: 0,
    raged: 0,
    leftInAir: 0,
    rerouted: 0,
    nearMisses: 0,
    bestStreak: 0,
    longestHoldSeconds: 0,
    longestHoldCallsign: '',
    worstDelaySeconds: 0,
    worstDelayCallsign: '',
    gameOverCallsign: '',
    score: 0,
  }
}

// Minimal store: React re-renders only when notify() fires (shift phase changes)
let version = 0
const listeners = new Set<() => void>()

export const gameStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  getSnapshot(): number {
    return version
  },
  notify(): void {
    version++
    listeners.forEach((fn) => fn())
  },
}

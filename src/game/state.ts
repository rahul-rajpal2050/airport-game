import type { FrameEvent, Plane } from './entities/plane'
import type { Gate } from './entities/gate'
import type { Runway } from './entities/runway'
import type { SpawnEntry } from './systems/spawn'

export type ShiftPhase = 'pre_shift' | 'active' | 'post_shift'

export interface ShiftStats {
  landed: number
  departed: number
  departedOnTime: number
  diverted: number
  raged: number
  leftInAir: number
  nearMisses: number
  bestStreak: number
  longestHoldSeconds: number
  longestHoldCallsign: string
  worstDelaySeconds: number
  worstDelayCallsign: string
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
  stats: ShiftStats
  selectedPlaneId: number | null
  /** consecutive near-misses without a failure; resets on diverted/raged */
  streak: number
  /** remaining slow-motion time (wall-clock ms); loop applies slowMoFactor while > 0 */
  slowMoMs: number
  /** last near-miss shiftTime per plane pair, for the cooldown */
  nearMissPairs: Map<string, number>
}

export function newStats(): ShiftStats {
  return {
    landed: 0,
    departed: 0,
    departedOnTime: 0,
    diverted: 0,
    raged: 0,
    leftInAir: 0,
    nearMisses: 0,
    bestStreak: 0,
    longestHoldSeconds: 0,
    longestHoldCallsign: '',
    worstDelaySeconds: 0,
    worstDelayCallsign: '',
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

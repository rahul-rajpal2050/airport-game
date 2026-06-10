import type { FrameEvent, Plane } from './entities/plane'
import type { Runway } from './entities/runway'
import type { SpawnEntry } from './systems/spawn'

export type ShiftPhase = 'pre_shift' | 'active' | 'post_shift'

export interface ShiftStats {
  landed: number
  diverted: number
  leftInAir: number
  longestHoldSeconds: number
  longestHoldCallsign: string
  score: number
}

export interface GameState {
  phase: ShiftPhase
  seed: number | string
  shiftTime: number
  timeScale: number
  planes: Plane[]
  runways: Runway[]
  schedule: SpawnEntry[]
  scheduleIndex: number
  events: FrameEvent[]
  stats: ShiftStats
  selectedPlaneId: number | null
}

export function newStats(): ShiftStats {
  return {
    landed: 0,
    diverted: 0,
    leftInAir: 0,
    longestHoldSeconds: 0,
    longestHoldCallsign: '',
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

import { CONFIG } from '../config'
import { detectNearMisses } from './systems/collision'
import { applyScoring } from './systems/scoring'
import { updateSpawns } from './systems/spawn'
import type { GameState } from './state'

/**
 * Advances the simulation by dt (already time-scaled) seconds.
 * Pure game logic — no DOM, no canvas — so the full loop is testable headlessly.
 * Returns true if the shift ended this tick.
 */
export function simulate(state: GameState, dt: number): boolean {
  state.shiftTime += dt

  // 1. spawn
  updateSpawns(state)

  // 2. planes (movement, drain, auto transitions)
  const occupiedRings = new Set<number>()
  for (const p of state.planes) {
    if (p.state === 'holding') occupiedRings.add(p.ringIndex)
  }
  const updateCtx = { events: state.events, shiftTime: state.shiftTime, occupiedRings }
  for (const plane of state.planes) plane.update(dt, updateCtx)

  // 3. near-miss detection
  detectNearMisses(state)

  // 4. runway sequencing
  for (const runway of state.runways) runway.sequence()

  // 5. scoring consumes events
  applyScoring(state)

  // 6. hand events to the juice layer (loop-side: sound/shake), start fresh
  state.juiceEvents = state.events
  state.events = []

  // 7. sweep finished planes
  state.planes = state.planes.filter((p) => p.state !== 'departed' && p.state !== 'diverted')

  return state.shiftTime >= CONFIG.shift.durationSeconds
}

import { CONFIG } from '../config'
import type { UpdateContext } from './entities/plane'
import { detectNearMisses } from './systems/collision'
import {
  consumeRiskRoll,
  fuelMultiplier,
  goAroundProbability,
  patienceMultiplier,
  tickEvents,
} from './systems/events'
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

  // 2. events: fire due events, expire effects, tick medical deadlines
  tickEvents(state)

  // 3. planes (movement, drain, auto transitions)
  const occupiedRings = new Set<number>()
  for (const p of state.planes) {
    if (p.state === 'holding') occupiedRings.add(p.ringIndex)
  }
  const updateCtx: UpdateContext = {
    events: state.events,
    shiftTime: state.shiftTime,
    occupiedRings,
    patienceMult: patienceMultiplier(state) * state.modifiers.patienceDrainMult,
    fuelMult: fuelMultiplier(state) * state.modifiers.fuelDrainMult,
    turnaroundMult: state.modifiers.turnaroundMult,
    goAround: (runwayId) => {
      const p = goAroundProbability(state, runwayId)
      return p > 0 && consumeRiskRoll(state) < p
    },
    consumeRolloutMult: () => {
      const mult = state.nextRolloutMult
      state.nextRolloutMult = 1
      return mult
    },
  }
  for (const plane of state.planes) plane.update(dt, updateCtx)

  // 4. near-miss detection
  detectNearMisses(state)

  // 5. runway sequencing
  for (const runway of state.runways) runway.sequence(state.shiftTime)

  // 6. scoring consumes events
  applyScoring(state)

  // 7. hand events to the juice layer (loop-side: sound/shake), start fresh
  state.juiceEvents = state.events
  state.events = []

  // 8. sweep finished planes
  state.planes = state.planes.filter((p) => p.state !== 'departed' && p.state !== 'diverted')

  return state.shiftTime >= CONFIG.shift.durationSeconds
}

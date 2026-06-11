import { describe, expect, it } from 'bun:test'
import { CONFIG } from '../config'
import { RNG } from '../utils/rng'
import { Gate } from './entities/gate'
import { Runway } from './entities/runway'
import { simulate } from './sim'
import { newGameState, type GameState } from './state'
import { generateSchedule } from './systems/spawn'

function makeShiftState(seed: number | string): GameState {
  const state = newGameState(seed)
  state.phase = 'active'
  state.runways = CONFIG.runway.positions
    .slice(0, CONFIG.runway.count)
    .map((p, i) => new Runway(i, p.x, p.y, p.angle))
  state.gates = Array.from({ length: CONFIG.gate.count }, (_, i) => new Gate(i))
  state.schedule = generateSchedule(new RNG(seed))
  return state
}

/**
 * Runs a full shift at fixed dt. The attentive controller assigns every
 * unassigned arrival a runway (round-robin), reserves a free gate for any
 * plane that lacks one, and sends boarding planes to the emptier runway.
 */
function runFullShift(seed: number | string, assign: boolean): GameState {
  const state = makeShiftState(seed)
  const dt = 1 / 60
  let nextRunway = 0
  let ended = false
  while (!ended) {
    if (assign) {
      for (const plane of state.planes) {
        if (plane.isAirborneControllable && !plane.assignedRunway) {
          state.runways[nextRunway % state.runways.length].enqueue(plane)
          nextRunway++
        }
        const needsGate =
          !plane.assignedGate &&
          (plane.isAirborneControllable || plane.state === 'landing' ||
            (plane.state === 'rolling' && plane.rolloutDone))
        if (needsGate) {
          const freeGate = state.gates.find((g) => g.free)
          if (freeGate) freeGate.reserve(plane)
        }
        if (plane.state === 'boarding' && !plane.assignedRunway) {
          const emptier = state.runways.reduce((a, b) => (a.queue.length <= b.queue.length ? a : b))
          emptier.enqueue(plane)
        }
      }
    }
    ended = simulate(state, dt)
  }
  state.stats.leftInAir = state.planes.filter((p) => p.isAirborneControllable).length
  return state
}

describe('full shift simulation', () => {
  it('an attentive controller lands and departs planes through the full pipeline', () => {
    const state = runFullShift('integration-seed', true)
    expect(state.stats.landed).toBeGreaterThan(0)
    expect(state.stats.departed).toBeGreaterThan(0)
    expect(state.stats.departedOnTime).toBeGreaterThan(0)
    expect(state.stats.score).toBeGreaterThan(0)
  })

  it('an absent controller diverts everything that runs dry (the spiral)', () => {
    const state = runFullShift('integration-seed', false)
    expect(state.stats.landed).toBe(0)
    expect(state.stats.departed).toBe(0)
    expect(state.stats.diverted).toBeGreaterThan(0)
    expect(state.stats.score).toBeLessThan(0)
  })

  it('same seed twice produces identical outcomes (determinism contract)', () => {
    const a = runFullShift('2026-06-10', true)
    const b = runFullShift('2026-06-10', true)
    expect(a.stats).toEqual(b.stats)
    expect(a.schedule).toEqual(b.schedule)
  })

  it('shift ends at the configured duration', () => {
    const state = runFullShift(99, false)
    expect(state.shiftTime).toBeGreaterThanOrEqual(CONFIG.shift.durationSeconds)
    expect(state.shiftTime).toBeLessThan(CONFIG.shift.durationSeconds + 1)
  })
})

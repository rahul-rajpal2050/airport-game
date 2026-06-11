import { describe, expect, it } from 'bun:test'
import { CONFIG } from '../config'
import { RNG } from '../utils/rng'
import { Gate } from './entities/gate'
import { Runway } from './entities/runway'
import { simulate } from './sim'
import { newGameState, type GameState } from './state'
import { generateEventSchedule, resolveEvent, rollRiskLottery } from './systems/events'
import { generateSchedule } from './systems/spawn'

function makeShiftState(seed: number | string): GameState {
  const state = newGameState(seed)
  state.phase = 'active'
  state.runways = CONFIG.runway.positions
    .slice(0, CONFIG.runway.count)
    .map((p, i) => new Runway(i, p.x, p.y, p.angle))
  state.gates = Array.from({ length: CONFIG.gate.count }, (_, i) => new Gate(i))
  const rng = new RNG(seed)
  state.schedule = generateSchedule(rng)
  state.eventSchedule = generateEventSchedule(rng)
  state.riskRolls = rollRiskLottery(rng)
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
    // scripted event choice: always option B (same input sequence both runs)
    if (state.pendingEvent) resolveEvent(state, 1)
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

  it('fuel modifier changes outcomes: slower drain means fewer diversions when ignored', () => {
    const base = runFullShift('modifier-seed', false)
    const eased = (() => {
      const state = makeShiftState('modifier-seed')
      state.modifiers.fuelDrainMult = 0.3
      const dt = 1 / 60
      let ended = false
      while (!ended) ended = simulate(state, dt)
      return state
    })()
    expect(base.stats.diverted).toBeGreaterThan(0)
    expect(eased.stats.diverted).toBeLessThan(base.stats.diverted)
  })

  it('near-miss toggle off produces zero near-misses on a seed that has them', () => {
    const on = runFullShift('integration-seed', true)
    expect(on.stats.nearMisses).toBeGreaterThan(0)

    const state = makeShiftState('integration-seed')
    state.nearMissesEnabled = false
    const dt = 1 / 60
    let nextRunway = 0
    let ended = false
    while (!ended) {
      if (state.pendingEvent) resolveEvent(state, 1)
      for (const plane of state.planes) {
        if (plane.isAirborneControllable && !plane.assignedRunway) {
          state.runways[nextRunway++ % state.runways.length].enqueue(plane)
        }
        if (!plane.assignedGate && plane.isAirborneControllable) {
          const g = state.gates.find((g) => g.free)
          if (g) g.reserve(plane)
        }
        if (plane.state === 'boarding' && !plane.assignedRunway) state.runways[0].enqueue(plane)
      }
      ended = simulate(state, dt)
    }
    expect(state.stats.nearMisses).toBe(0)
    expect(state.streak).toBe(0)
  })

  it('determinism holds with modifiers active', () => {
    const run = () => {
      const state = makeShiftState('mod-det')
      state.modifiers.fuelDrainMult = 0.6
      state.modifiers.patienceDrainMult = 0.75
      const dt = 1 / 60
      let ended = false
      while (!ended) {
        if (state.pendingEvent) resolveEvent(state, 1)
        ended = simulate(state, dt)
      }
      return state.stats
    }
    expect(run()).toEqual(run())
  })
})

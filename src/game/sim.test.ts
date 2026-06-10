import { describe, expect, it } from 'bun:test'
import { CONFIG } from '../config'
import { RNG } from '../utils/rng'
import { Runway } from './entities/runway'
import { simulate } from './sim'
import { newStats, type GameState } from './state'
import { generateSchedule } from './systems/spawn'

function makeShiftState(seed: number | string): GameState {
  return {
    phase: 'active',
    seed,
    shiftTime: 0,
    timeScale: 1,
    planes: [],
    runways: CONFIG.runway.positions
      .slice(0, CONFIG.runway.count)
      .map((p, i) => new Runway(i, p.x, p.y, p.angle)),
    schedule: generateSchedule(new RNG(seed)),
    scheduleIndex: 0,
    events: [],
    stats: newStats(),
    selectedPlaneId: null,
  }
}

/** Runs a full shift at fixed dt; controller assigns every unassigned plane round-robin */
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
      }
    }
    ended = simulate(state, dt)
  }
  state.stats.leftInAir = state.planes.filter((p) => p.isAirborneControllable).length
  return state
}

describe('full shift simulation', () => {
  it('an attentive controller lands most planes', () => {
    const state = runFullShift('integration-seed', true)
    const total = state.stats.landed + state.stats.diverted + state.stats.leftInAir
    expect(state.schedule.length).toBe(total + state.planes.filter((p) => !p.isAirborneControllable).length)
    expect(state.stats.landed).toBeGreaterThan(0)
    expect(state.stats.score).toBeGreaterThan(0)
  })

  it('an absent controller diverts everything that runs dry (the spiral)', () => {
    const state = runFullShift('integration-seed', false)
    expect(state.stats.landed).toBe(0)
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

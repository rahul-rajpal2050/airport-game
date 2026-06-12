import { describe, expect, it } from 'bun:test'
import { CONFIG } from '../../config'
import { Plane } from '../entities/plane'
import { newGameState, newStats, type GameState } from '../state'
import { applyScoring, satisfactionOf } from './scoring'

function makeState(): GameState {
  const state = newGameState(1)
  state.phase = 'active'
  return state
}

function makePlane(): Plane {
  return new Plane(1, 'AA111', 0, 0, 80, 0)
}

const S = CONFIG.scoring

describe('satisfactionOf', () => {
  it('perfect punctuality with no complaints is 100', () => {
    const stats = newStats()
    stats.landed = 10
    stats.arrivedOnTime = 10
    stats.departed = 8
    stats.departedOnTime = 8
    expect(satisfactionOf(stats)).toBe(100)
  })

  it('no data yet is neutral, not zero', () => {
    expect(satisfactionOf(newStats())).toBe(100)
  })

  it('weights departures heavier than arrivals', () => {
    const Sat = CONFIG.satisfaction
    const lateArrivals = newStats()
    lateArrivals.landed = 10
    lateArrivals.arrivedOnTime = 0
    lateArrivals.departed = 10
    lateArrivals.departedOnTime = 10
    const lateDepartures = newStats()
    lateDepartures.landed = 10
    lateDepartures.arrivedOnTime = 10
    lateDepartures.departed = 10
    lateDepartures.departedOnTime = 0
    expect(satisfactionOf(lateArrivals)).toBe(Math.round(100 * Sat.weightDepartures))
    expect(satisfactionOf(lateDepartures)).toBe(Math.round(100 * Sat.weightArrivals))
    expect(satisfactionOf(lateDepartures)).toBeLessThan(satisfactionOf(lateArrivals))
  })

  it('complaints subtract and the result clamps at zero', () => {
    const stats = newStats()
    stats.landed = 4
    stats.arrivedOnTime = 4
    stats.departed = 4
    stats.departedOnTime = 4
    stats.raged = 2
    stats.diverted = 1
    expect(satisfactionOf(stats)).toBe(100 - 3 * CONFIG.satisfaction.complaintPenalty)

    stats.raged = 50
    expect(satisfactionOf(stats)).toBe(0)
  })
})

describe('applyScoring', () => {
  it('full patience landing pays the full landing base', () => {
    const state = makeState()
    state.events.push({ type: 'landed', plane: makePlane() })
    applyScoring(state, 0)
    expect(state.stats.score).toBe(S.landingBase)
    expect(state.stats.landed).toBe(1)
  })

  it('on-time departure pays depart base plus on-time bonus', () => {
    const state = makeState()
    state.events.push({ type: 'departed_ok', plane: makePlane(), delaySeconds: 0 })
    applyScoring(state, 0)
    expect(state.stats.score).toBe(S.departBase + S.onTimeBonus)
    expect(state.stats.departed).toBe(1)
    expect(state.stats.departedOnTime).toBe(1)
  })

  it('late departure pays reduced base, no bonus, and tracks worst delay', () => {
    const state = makeState()
    const delay = 100
    state.events.push({ type: 'departed_ok', plane: makePlane(), delaySeconds: delay })
    applyScoring(state, 0)
    const expectedFrac = Math.max(1 - delay * S.lateMultiplierPerSecond, S.minLandingFraction)
    expect(state.stats.score).toBe(Math.round(S.departBase * expectedFrac))
    expect(state.stats.departedOnTime).toBe(0)
    expect(state.stats.worstDelaySeconds).toBe(delay)
    expect(state.stats.worstDelayCallsign).toBe('AA111')
  })

  it('extreme delay floors at minLandingFraction', () => {
    const state = makeState()
    state.events.push({ type: 'departed_ok', plane: makePlane(), delaySeconds: 9999 })
    applyScoring(state, 0)
    expect(state.stats.score).toBe(Math.round(S.departBase * S.minLandingFraction))
  })

  it('diversion and rage subtract their penalties', () => {
    const state = makeState()
    state.events.push({ type: 'diverted', plane: makePlane() })
    state.events.push({ type: 'raged', plane: makePlane() })
    applyScoring(state, 0)
    expect(state.stats.score).toBe(-S.diversionPenalty - S.ragePenalty)
    expect(state.stats.diverted).toBe(1)
    expect(state.stats.raged).toBe(1)
  })

  it('near-miss streak compounds the bonus and tracks the best', () => {
    const state = makeState()
    const a = makePlane()
    const b = new Plane(2, 'BB222', 0, 0, 80, 0)
    state.events.push({ type: 'near_miss', a, b })
    state.events.push({ type: 'near_miss', a, b })
    applyScoring(state, 0)
    const expected =
      Math.round(S.nearMissBonus) + Math.round(S.nearMissBonus * (1 + S.streakMultiplierStep))
    expect(state.stats.score).toBe(expected)
    expect(state.streak).toBe(2)
    expect(state.stats.bestStreak).toBe(2)
    expect(state.stats.nearMisses).toBe(2)
  })

  it('rage resets the streak but keeps the best', () => {
    const state = makeState()
    state.streak = 4
    state.stats.bestStreak = 4
    state.events.push({ type: 'raged', plane: makePlane() })
    applyScoring(state, 0)
    expect(state.streak).toBe(0)
    expect(state.stats.bestStreak).toBe(4)
  })

  it('counts A:00 for landings within the arrival window, not late ones', () => {
    const state = makeState()
    const prompt = new Plane(1, 'OT100', 0, 0, 100, 10) // spawned at 10s
    const late = new Plane(2, 'LT200', 0, 0, 100, 10)
    state.shiftTime = 10 + CONFIG.satisfaction.arrivalWindowSeconds - 1
    state.events.push({ type: 'landed', plane: prompt })
    applyScoring(state, 0)
    expect(state.stats.arrivedOnTime).toBe(1)

    state.shiftTime = 10 + CONFIG.satisfaction.arrivalWindowSeconds + 30
    state.events = [{ type: 'landed', plane: late }]
    applyScoring(state, 0)
    expect(state.stats.arrivedOnTime).toBe(1) // unchanged
    expect(state.stats.landed).toBe(2)
  })

  it('tracks the longest hold across landed and diverted planes', () => {
    const state = makeState()
    const quick = makePlane()
    quick.holdSeconds = 12
    const slow = new Plane(2, 'SS200', 0, 0, 80, 0)
    slow.holdSeconds = 87
    state.events.push({ type: 'landed', plane: quick })
    state.events.push({ type: 'diverted', plane: slow })
    applyScoring(state, 0)
    expect(state.stats.longestHoldSeconds).toBe(87)
    expect(state.stats.longestHoldCallsign).toBe('SS200')
  })
})

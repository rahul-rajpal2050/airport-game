import { describe, expect, it } from 'bun:test'
import { CONFIG } from '../../config'
import { Plane } from '../entities/plane'
import { newStats, type GameState } from '../state'
import { applyScoring } from './scoring'

function makeState(): GameState {
  return {
    phase: 'active',
    seed: 1,
    shiftTime: 0,
    timeScale: 1,
    planes: [],
    runways: [],
    gates: [],
    schedule: [],
    scheduleIndex: 0,
    events: [],
    stats: newStats(),
    selectedPlaneId: null,
    streak: 0,
    slowMoMs: 0,
    nearMissPairs: new Map(),
  }
}

function makePlane(): Plane {
  return new Plane(1, 'AA111', 0, 0, 80, 0)
}

const S = CONFIG.scoring

describe('applyScoring', () => {
  it('full patience landing pays the full landing base', () => {
    const state = makeState()
    state.events.push({ type: 'landed', plane: makePlane() })
    applyScoring(state)
    expect(state.stats.score).toBe(S.landingBase)
    expect(state.stats.landed).toBe(1)
    expect(state.events).toHaveLength(0)
  })

  it('on-time departure pays depart base plus on-time bonus', () => {
    const state = makeState()
    state.events.push({ type: 'departed_ok', plane: makePlane(), delaySeconds: 0 })
    applyScoring(state)
    expect(state.stats.score).toBe(S.departBase + S.onTimeBonus)
    expect(state.stats.departed).toBe(1)
    expect(state.stats.departedOnTime).toBe(1)
  })

  it('late departure pays reduced base, no bonus, and tracks worst delay', () => {
    const state = makeState()
    const delay = 100
    state.events.push({ type: 'departed_ok', plane: makePlane(), delaySeconds: delay })
    applyScoring(state)
    const expectedFrac = Math.max(1 - delay * S.lateMultiplierPerSecond, S.minLandingFraction)
    expect(state.stats.score).toBe(Math.round(S.departBase * expectedFrac))
    expect(state.stats.departedOnTime).toBe(0)
    expect(state.stats.worstDelaySeconds).toBe(delay)
    expect(state.stats.worstDelayCallsign).toBe('AA111')
  })

  it('extreme delay floors at minLandingFraction', () => {
    const state = makeState()
    state.events.push({ type: 'departed_ok', plane: makePlane(), delaySeconds: 9999 })
    applyScoring(state)
    expect(state.stats.score).toBe(Math.round(S.departBase * S.minLandingFraction))
  })

  it('diversion and rage subtract their penalties', () => {
    const state = makeState()
    state.events.push({ type: 'diverted', plane: makePlane() })
    state.events.push({ type: 'raged', plane: makePlane() })
    applyScoring(state)
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
    applyScoring(state)
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
    applyScoring(state)
    expect(state.streak).toBe(0)
    expect(state.stats.bestStreak).toBe(4)
  })

  it('tracks the longest hold across landed and diverted planes', () => {
    const state = makeState()
    const quick = makePlane()
    quick.holdSeconds = 12
    const slow = new Plane(2, 'SS200', 0, 0, 80, 0)
    slow.holdSeconds = 87
    state.events.push({ type: 'landed', plane: quick })
    state.events.push({ type: 'diverted', plane: slow })
    applyScoring(state)
    expect(state.stats.longestHoldSeconds).toBe(87)
    expect(state.stats.longestHoldCallsign).toBe('SS200')
  })
})

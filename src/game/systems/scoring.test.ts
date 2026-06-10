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

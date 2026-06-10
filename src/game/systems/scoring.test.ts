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
    schedule: [],
    scheduleIndex: 0,
    events: [],
    stats: newStats(),
    selectedPlaneId: null,
  }
}

describe('applyScoring', () => {
  it('full patience landing pays the full base', () => {
    const state = makeState()
    const plane = new Plane(1, 'AA111', 0, 0, 80)
    state.events.push({ type: 'landed', plane })

    applyScoring(state)

    expect(state.stats.score).toBe(CONFIG.scoring.landingBase)
    expect(state.stats.landed).toBe(1)
    expect(state.events).toHaveLength(0)
  })

  it('drained patience floors at minLandingFraction', () => {
    const state = makeState()
    const plane = new Plane(1, 'AA111', 0, 0, 80)
    plane.patience = 0
    state.events.push({ type: 'landed', plane })

    applyScoring(state)

    expect(state.stats.score).toBe(
      Math.round(CONFIG.scoring.landingBase * CONFIG.scoring.minLandingFraction)
    )
  })

  it('diversion subtracts the penalty and counts the stat', () => {
    const state = makeState()
    const plane = new Plane(1, 'AA111', 0, 0, 80)
    state.events.push({ type: 'diverted', plane })

    applyScoring(state)

    expect(state.stats.score).toBe(-CONFIG.scoring.diversionPenalty)
    expect(state.stats.diverted).toBe(1)
  })

  it('tracks the longest hold across landed and diverted planes', () => {
    const state = makeState()
    const quick = new Plane(1, 'QQ100', 0, 0, 80)
    quick.holdSeconds = 12
    const slow = new Plane(2, 'SS200', 0, 0, 80)
    slow.holdSeconds = 87
    state.events.push({ type: 'landed', plane: quick })
    state.events.push({ type: 'diverted', plane: slow })

    applyScoring(state)

    expect(state.stats.longestHoldSeconds).toBe(87)
    expect(state.stats.longestHoldCallsign).toBe('SS200')
  })
})

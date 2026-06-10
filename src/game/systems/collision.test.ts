import { describe, expect, it } from 'bun:test'
import { CONFIG } from '../../config'
import { Plane } from '../entities/plane'
import { newStats, type GameState } from '../state'
import { detectNearMisses } from './collision'

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

function planeAt(id: number, x: number, y: number, state: Plane['state']): Plane {
  const p = new Plane(id, `NM${id}00`, x, y, 80, 0)
  if (state === 'holding') {
    p.transition('holding')
    p.ringIndex = 0
  }
  // approaching is the constructor default
  return p
}

const close = CONFIG.nearMiss.thresholdPixels - 1

describe('detectNearMisses', () => {
  it('fires for an approaching plane brushing a holding plane', () => {
    const state = makeState()
    state.planes = [planeAt(1, 100, 100, 'approaching'), planeAt(2, 100 + close, 100, 'holding')]
    detectNearMisses(state)
    expect(state.events.filter((e) => e.type === 'near_miss')).toHaveLength(1)
    expect(state.slowMoMs).toBe(CONFIG.nearMiss.slowMoDurationMs)
  })

  it('never fires for two holding planes (stable ring separation)', () => {
    const state = makeState()
    state.planes = [planeAt(1, 100, 100, 'holding'), planeAt(2, 100 + close, 100, 'holding')]
    detectNearMisses(state)
    expect(state.events).toHaveLength(0)
  })

  it('respects the per-pair cooldown, then fires again', () => {
    const state = makeState()
    state.planes = [planeAt(1, 100, 100, 'approaching'), planeAt(2, 100 + close, 100, 'approaching')]

    detectNearMisses(state)
    detectNearMisses(state) // same tick distance, still inside cooldown
    state.shiftTime += CONFIG.nearMiss.cooldownSeconds - 0.1
    detectNearMisses(state)
    expect(state.events.filter((e) => e.type === 'near_miss')).toHaveLength(1)

    state.shiftTime += 0.2 // past cooldown
    detectNearMisses(state)
    expect(state.events.filter((e) => e.type === 'near_miss')).toHaveLength(2)
  })

  it('ignores planes beyond the threshold', () => {
    const state = makeState()
    state.planes = [
      planeAt(1, 100, 100, 'approaching'),
      planeAt(2, 100 + CONFIG.nearMiss.thresholdPixels + 5, 100, 'approaching'),
    ]
    detectNearMisses(state)
    expect(state.events).toHaveLength(0)
  })
})

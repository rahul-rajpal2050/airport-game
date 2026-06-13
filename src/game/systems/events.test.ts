import { describe, expect, it } from 'bun:test'
import { CONFIG } from '../../config'
import { RNG } from '../../utils/rng'
import { Gate } from '../entities/gate'
import { Plane } from '../entities/plane'
import { Runway } from '../entities/runway'
import { newGameState, type GameState } from '../state'
import {
  applyRunwayPick,
  consumeRiskRoll,
  fuelMultiplier,
  generateEventSchedule,
  goAroundProbability,
  patienceMultiplier,
  reroutePlane,
  resolveEvent,
  rollRiskLottery,
  tickEvents,
} from './events'
import { applyScoring } from './scoring'
import { updateSpawns } from './spawn'

function makeState(): GameState {
  const state = newGameState(1)
  state.phase = 'active'
  state.runways = [new Runway(0, 130, 560, -20), new Runway(1, 260, 560, 20)]
  return state
}

function holdingPlane(id: number, holdSeconds = 0): Plane {
  const p = new Plane(id, `EV${id}00`, 0, 0, 80, 0)
  p.transition('holding')
  p.ringIndex = id
  p.holdSeconds = holdSeconds
  return p
}

describe('generateEventSchedule', () => {
  it('same seed produces an identical schedule', () => {
    expect(generateEventSchedule(new RNG('daily'))).toEqual(generateEventSchedule(new RNG('daily')))
  })

  it('picks distinct events within their windows, sorted by time', () => {
    const schedule = generateEventSchedule(new RNG(7))
    expect(schedule.length).toBe(CONFIG.events.maxPerShift)
    expect(new Set(schedule.map((s) => s.defId)).size).toBe(schedule.length)
    for (let i = 0; i < schedule.length; i++) {
      const def = CONFIG.events.defs.find((d) => d.id === schedule[i].defId)!
      expect(schedule[i].time).toBeGreaterThanOrEqual(def.windowSeconds[0])
      expect(schedule[i].time).toBeLessThanOrEqual(def.windowSeconds[1])
      if (i > 0) expect(schedule[i].time).toBeGreaterThanOrEqual(schedule[i - 1].time)
    }
  })

  it('risk lottery is identical for the same seed', () => {
    expect(rollRiskLottery(new RNG(42))).toEqual(rollRiskLottery(new RNG(42)))
  })

  it('forced events always appear; count override respected', () => {
    for (let seed = 0; seed < 10; seed++) {
      const schedule = generateEventSchedule(new RNG(seed), { count: 2, forced: ['fog'] })
      expect(schedule.some((s) => s.defId === 'fog')).toBe(true)
      expect(schedule.length).toBe(2)
    }
    expect(generateEventSchedule(new RNG(1), { count: 3 }).length).toBe(3)
  })
})

describe('tickEvents', () => {
  it('fires a due event and defers the next while the dialog is open', () => {
    const state = makeState()
    state.eventSchedule = [
      { defId: 'fog', time: 10 },
      { defId: 'medical', time: 11 },
    ]
    state.planes = [holdingPlane(1, 30)]
    state.shiftTime = 12 // both are due

    tickEvents(state)
    expect(state.pendingEvent?.def.id).toBe('fog')
    tickEvents(state)
    expect(state.pendingEvent?.def.id).toBe('fog') // medical deferred

    resolveEvent(state, 0)
    tickEvents(state)
    expect(state.pendingEvent?.def.id).toBe('medical')
  })

  it('medical marks the longest-holding plane and force-diverts past the deadline', () => {
    const state = makeState()
    const impatient = holdingPlane(1, 90)
    const fresh = holdingPlane(2, 5)
    state.planes = [fresh, impatient]
    state.eventSchedule = [{ defId: 'medical', time: 10 }]
    state.shiftTime = 10

    tickEvents(state)
    expect(impatient.kind).toBe('medical')
    expect(fresh.kind).toBe('normal')
    expect(state.pendingEvent?.markedPlaneId).toBe(1)

    resolveEvent(state, 1) // maintain sequence
    state.shiftTime = 10 + CONFIG.events.medical.landWithinSeconds + 1
    tickEvents(state)
    expect(impatient.state).toBe('diverted')
    expect(state.events.some((e) => e.type === 'diverted')).toBe(true)
  })
})

describe('effect application', () => {
  it('fog option A hands the player a runway choice, which then closes the picked strip', () => {
    const state = makeState()
    state.eventSchedule = [{ defId: 'fog', time: 5 }]
    state.shiftTime = 5

    tickEvents(state)
    resolveEvent(state, 0)
    // no runway is closed yet — the engine is awaiting the player's pick
    expect(state.runwayPick).not.toBeNull()
    expect(state.runways.every((r) => r.closedUntil === 0)).toBe(true)

    // player clicks runway 1
    applyRunwayPick(state, state.runways[1])
    expect(state.runwayPick).toBeNull()
    expect(state.runways[1].closedUntil).toBe(5 + 45)
    expect(state.runways[0].closedUntil).toBe(0) // the other strip stays open
  })

  it('re-route clears a plane from the airspace as an ops cost, not a complaint', () => {
    const state = makeState()
    const plane = holdingPlane(1)
    state.planes = [plane]
    state.runways[0].enqueue(plane)
    const gate = new Gate(0)
    gate.reserve(plane)

    reroutePlane(state, plane)
    expect(plane.state).toBe('diverted') // reuses the sweep
    expect(state.runways[0].queue).toHaveLength(0)
    expect(gate.free).toBe(true) // gate reservation released
    expect(state.events.some((e) => e.type === 'rerouted')).toBe(true)
    expect(state.events.some((e) => e.type === 'diverted')).toBe(false)

    applyScoring(state, 0)
    expect(state.stats.rerouted).toBe(1)
    expect(state.stats.diverted).toBe(0) // no complaint
    expect(state.stats.score).toBe(-CONFIG.scoring.reroutePenalty)
  })

  it('re-route only applies to airborne planes', () => {
    const state = makeState()
    const plane = holdingPlane(1)
    plane.transition('landing') // committed, no longer airborne-controllable
    state.planes = [plane]
    reroutePlane(state, plane)
    expect(plane.state).toBe('landing')
    expect(state.events.some((e) => e.type === 'rerouted')).toBe(false)
  })

  it('fog option B activates a global go-around risk that expires', () => {
    const state = makeState()
    state.eventSchedule = [{ defId: 'fog', time: 5 }]
    state.shiftTime = 5
    tickEvents(state)
    resolveEvent(state, 1)

    expect(goAroundProbability(state, 0)).toBeCloseTo(0.35)
    expect(goAroundProbability(state, 1)).toBeCloseTo(0.35)

    state.shiftTime = 51
    tickEvents(state) // expires stale effects
    expect(goAroundProbability(state, 0)).toBe(0)
  })

  it('medical option A queue-jumps the marked plane and applies the patience multiplier', () => {
    const state = makeState()
    const early = holdingPlane(1, 10)
    const marked = holdingPlane(2, 99)
    state.planes = [early, marked]
    state.runways[0].enqueue(early)
    state.runways[0].enqueue(marked)
    state.eventSchedule = [{ defId: 'medical', time: 5 }]
    state.shiftTime = 5

    tickEvents(state)
    resolveEvent(state, 0)

    expect(state.runways[0].queue[0]).toBe(marked)
    expect(patienceMultiplier(state)).toBeCloseTo(1.5)
    expect(fuelMultiplier(state)).toBe(1)
  })

  it('vip marks the next spawn', () => {
    const state = makeState()
    state.eventSchedule = [{ defId: 'vip', time: 5 }]
    state.shiftTime = 5
    tickEvents(state)
    resolveEvent(state, 1)
    expect(state.nextSpawnKind).toBe('vip')
    expect(state.vipPriority).toBe(false)
  })

  it('vip red carpet queue-jumps at spawn time', () => {
    const state = makeState()
    const queued = holdingPlane(1)
    state.runways[0].enqueue(queued)
    state.eventSchedule = [{ defId: 'vip', time: 5 }]
    state.shiftTime = 5
    tickEvents(state)
    resolveEvent(state, 0) // red carpet
    expect(state.vipPriority).toBe(true)

    // next spawn becomes the VIP and lands at the front of a queue
    state.schedule = [{ time: 5, x: 0, y: 0, callsign: 'VIP01', fuel: 80, size: 'small' }]
    updateSpawns(state)
    const vip = state.planes.find((p) => p.callsign === 'VIP01')!
    expect(vip.kind).toBe('vip')
    expect(vip.assignedRunway).not.toBeNull()
    expect(vip.assignedRunway!.queue[0]).toBe(vip)
    expect(state.vipPriority).toBe(false)
  })

  it('bird strike sets the next rollout multiplier', () => {
    const state = makeState()
    state.eventSchedule = [{ defId: 'bird_strike', time: 5 }]
    state.shiftTime = 5
    tickEvents(state)
    expect(state.nextRolloutMult).toBe(2)
  })

  it('risk rolls consume deterministically', () => {
    const a = makeState()
    const b = makeState()
    a.riskRolls = rollRiskLottery(new RNG(9))
    b.riskRolls = rollRiskLottery(new RNG(9))
    for (let i = 0; i < 10; i++) {
      expect(consumeRiskRoll(a)).toBe(consumeRiskRoll(b))
    }
    expect(a.riskIndex).toBe(10)
  })
})

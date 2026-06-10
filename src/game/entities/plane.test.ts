import { describe, expect, it } from 'bun:test'
import { CONFIG } from '../../config'
import { Plane, type UpdateContext } from './plane'
import { Runway } from './runway'

function makeCtx(): UpdateContext {
  return { events: [], shiftTime: 0, occupiedRings: new Set() }
}

function makePlane(fuel = CONFIG.plane.initialFuel): Plane {
  return new Plane(1, 'TS100', 0, 0, fuel)
}

describe('Plane state machine', () => {
  it('walks the happy path: approaching → holding → landing → rolling → departed', () => {
    const plane = makePlane()
    const runway = new Runway(0, 130, 560, -20)
    runway.enqueue(plane)

    plane.transition('holding')
    expect(plane.state).toBe('holding')

    plane.transition('landing')
    expect(plane.state).toBe('landing')

    plane.transition('rolling')
    expect(plane.state).toBe('rolling')

    plane.transition('departed')
    expect(plane.state).toBe('departed')
  })

  it('throws on illegal transitions', () => {
    const plane = makePlane()
    expect(() => plane.transition('rolling')).toThrow(/Illegal transition/)
    expect(() => plane.transition('departed')).toThrow(/Illegal transition/)
  })

  it('diverts when fuel runs out while holding (edge case)', () => {
    const plane = makePlane(1) // nearly empty
    const ctx = makeCtx()
    plane.transition('holding')
    plane.ringIndex = 0

    // 1 fuel / 0.4 drain per second = empty within 3 seconds
    plane.update(3, ctx)

    expect(plane.state).toBe('diverted')
    expect(plane.fuel).toBe(0)
    expect(ctx.events).toHaveLength(1)
    expect(ctx.events[0].type).toBe('diverted')
  })

  it('completes roll-out and emits landed event after occupancySeconds', () => {
    const plane = makePlane()
    const runway = new Runway(0, 130, 560, -20)
    runway.enqueue(plane)
    plane.transition('landing')
    // snap to threshold so the next update enters rolling
    const { threshold } = runway.geometry()
    plane.x = threshold.x
    plane.y = threshold.y
    const ctx = makeCtx()
    plane.update(0.001, ctx)
    expect(plane.state).toBe('rolling')

    plane.update(CONFIG.runway.occupancySeconds, ctx)
    expect(plane.state).toBe('departed')
    expect(ctx.events.some((e) => e.type === 'landed')).toBe(true)
  })

  it('accumulates hold time and drains patience while holding', () => {
    const plane = makePlane()
    const ctx = makeCtx()
    plane.transition('holding')
    plane.ringIndex = 0

    plane.update(10, ctx)

    expect(plane.holdSeconds).toBeCloseTo(10)
    expect(plane.patience).toBeCloseTo(
      CONFIG.plane.initialPatience - CONFIG.plane.patienceDrainPerSecond * 10
    )
  })
})

describe('Runway sequencing', () => {
  it('commits the queue head when free and clears after departure', () => {
    const runway = new Runway(0, 130, 560, -20)
    const first = makePlane()
    const second = new Plane(2, 'TS200', 0, 0, CONFIG.plane.initialFuel)
    first.transition('holding')
    second.transition('holding')
    runway.enqueue(first)
    runway.enqueue(second)

    runway.sequence()
    expect(runway.current).toBe(first)
    expect(first.state).toBe('landing')
    expect(second.state).toBe('holding')

    first.transition('rolling')
    first.transition('departed')
    runway.sequence()
    expect(runway.current).toBe(second)
    expect(second.state).toBe('landing')
  })

  it('reassignment moves a plane between runway queues', () => {
    const a = new Runway(0, 130, 560, -20)
    const b = new Runway(1, 260, 560, 20)
    const plane = makePlane()
    a.enqueue(plane)
    b.enqueue(plane)
    expect(a.queue).toHaveLength(0)
    expect(b.queue).toHaveLength(1)
    expect(plane.assignedRunway).toBe(b)
  })

  it('skips diverted planes in the queue', () => {
    const runway = new Runway(0, 130, 560, -20)
    const dead = makePlane(1)
    dead.transition('holding')
    dead.ringIndex = 0
    runway.enqueue(dead)
    dead.update(5, makeCtx()) // diverts
    expect(dead.state).toBe('diverted')

    runway.sequence()
    expect(runway.current).toBeNull()
    expect(runway.queue).toHaveLength(0)
  })
})

import { describe, expect, it } from 'bun:test'
import { CONFIG } from '../../config'
import { Gate } from './gate'
import { neutralContext, Plane, type UpdateContext } from './plane'
import { Runway } from './runway'

function makeCtx(shiftTime = 0): UpdateContext {
  return neutralContext(shiftTime)
}

function makePlane(fuel = CONFIG.plane.initialFuel, id = 1): Plane {
  return new Plane(id, `TS${id}00`, 0, 0, fuel, 0)
}

function runUntil(plane: Plane, ctx: UpdateContext, predicate: () => boolean, maxSeconds = 120): void {
  const dt = 0.1
  let t = 0
  while (!predicate() && t < maxSeconds) {
    plane.update(dt, ctx)
    t += dt
  }
}

describe('Plane state machine', () => {
  it('walks the full pipeline: approach to departed', () => {
    const plane = makePlane()
    const runway = new Runway(0, 130, 560, -20)
    const gate = new Gate(0)
    const ctx = makeCtx()

    plane.transition('holding')
    plane.ringIndex = 0
    runway.enqueue(plane)
    gate.reserve(plane)

    // arrival: landing -> rolling -> (rollout) -> taxiing -> at_gate
    runway.sequence()
    expect(plane.state).toBe('landing')
    runUntil(plane, ctx, () => plane.state === 'at_gate')
    expect(plane.state).toBe('at_gate')
    expect(gate.occupied).toBe(true)
    expect(ctx.events.some((e) => e.type === 'landed')).toBe(true)

    // turnaround -> boarding
    runUntil(plane, ctx, () => plane.state === 'boarding')
    expect(plane.state).toBe('boarding')
    expect(ctx.events.some((e) => e.type === 'boarding_ready')).toBe(true)

    // departure assignment back to the same runway: gate frees on pushback
    runway.enqueue(plane)
    expect(plane.state).toBe('taxiing_out')
    expect(gate.free).toBe(true)

    runUntil(plane, ctx, () => plane.atHoldShort)
    runway.sequence()
    expect(plane.state).toBe('departing')

    runUntil(plane, ctx, () => plane.state === 'departed', 300)
    expect(plane.state).toBe('departed')
    expect(ctx.events.some((e) => e.type === 'departed_ok')).toBe(true)
  })

  it('throws on illegal transitions', () => {
    const plane = makePlane()
    expect(() => plane.transition('rolling')).toThrow(/Illegal transition/)
    expect(() => plane.transition('departed')).toThrow(/Illegal transition/)
  })

  it('fuel exhaustion while circling emits fuel_out (game over), not a diversion', () => {
    const plane = makePlane(1)
    const ctx = makeCtx()
    plane.transition('holding')
    plane.ringIndex = 0

    plane.update(3, ctx)

    expect(plane.state).toBe('holding') // the shift ends; the plane does not transition
    expect(plane.fuel).toBe(0)
    expect(ctx.events.some((e) => e.type === 'fuel_out')).toBe(true)
    expect(ctx.events.some((e) => e.type === 'diverted')).toBe(false)
  })

  it('per-size circling budgets: small lasts 60s, large 120s', () => {
    const small = new Plane(1, 'SM100', 0, 0, 100, 0, 'small')
    const large = new Plane(2, 'LG200', 0, 0, 100, 0, 'large')
    const ctx = makeCtx()
    for (const p of [small, large]) {
      p.transition('holding')
      p.ringIndex = p.id
    }

    small.update(59, ctx)
    expect(small.fuel).toBeGreaterThan(0)
    small.update(2, ctx)
    expect(ctx.events.filter((e) => e.type === 'fuel_out')).toHaveLength(1)

    large.update(119, ctx)
    expect(large.fuel).toBeGreaterThan(0)
    large.update(2, ctx)
    expect(ctx.events.filter((e) => e.type === 'fuel_out')).toHaveLength(2)
  })

  it('approach does not burn fuel; only circling does', () => {
    const plane = makePlane(100)
    const ctx = makeCtx()
    plane.update(10, ctx) // approaching toward the holding stack
    expect(plane.fuel).toBe(100)
  })

  it('THE cascade: no gate means the plane blocks the runway and the next arrival waits', () => {
    const runway = new Runway(0, 130, 560, -20)
    const first = makePlane(CONFIG.plane.initialFuel, 1)
    const second = makePlane(CONFIG.plane.initialFuel, 2)
    const ctx = makeCtx()

    first.transition('holding')
    first.ringIndex = 0
    second.transition('holding')
    second.ringIndex = 1
    runway.enqueue(first)
    runway.enqueue(second)

    runway.sequence()
    expect(first.state).toBe('landing')

    // first lands and rolls out with NO gate assigned
    runUntil(first, ctx, () => first.rolloutDone)
    expect(first.state).toBe('rolling') // stuck

    runway.sequence()
    expect(runway.current).toBe(first) // still blocking
    expect(second.state).toBe('holding') // cascade: second cannot land

    // player assigns a gate -> first taxis -> runway frees -> second commits
    const gate = new Gate(0)
    gate.reserve(first)
    first.update(0.1, ctx)
    expect(first.state).toBe('taxiing')

    runway.sequence()
    expect(second.state).toBe('landing')
  })

  it('patience hits zero exactly once and fires raged', () => {
    const plane = makePlane()
    const ctx = makeCtx()
    plane.transition('holding')
    plane.ringIndex = 0
    plane.patience = 0.01

    runUntil(plane, ctx, () => plane.raged, 10)
    plane.update(5, ctx) // keep waiting after rage

    const rageEvents = ctx.events.filter((e) => e.type === 'raged')
    expect(rageEvents).toHaveLength(1)
    expect(plane.patience).toBe(0)
  })

  it('go-around: aborts at the threshold, frees the runway, rejoins the back of the queue', () => {
    const runway = new Runway(0, 130, 560, -20)
    const plane = makePlane()
    const ctx = makeCtx()
    ctx.goAround = () => true // risk active, roll fails

    plane.transition('holding')
    plane.ringIndex = 0
    runway.enqueue(plane)
    runway.sequence()
    expect(plane.state).toBe('landing')
    expect(runway.current).toBe(plane)

    runUntil(plane, ctx, () => plane.state !== 'landing')

    expect(plane.state).toBe('approaching')
    expect(runway.current).toBeNull()
    expect(runway.queue[runway.queue.length - 1]).toBe(plane) // back of the line
    expect(ctx.events.some((e) => e.type === 'go_around')).toBe(true)
  })

  it('rollout multiplier doubles runway occupancy (bird strike)', () => {
    const runway = new Runway(0, 130, 560, -20)
    const plane = makePlane()
    const ctx = makeCtx()
    ctx.consumeRolloutMult = () => 2

    plane.transition('holding')
    plane.ringIndex = 0
    runway.enqueue(plane)
    runway.sequence()
    const { threshold } = runway.geometry()
    plane.x = threshold.x
    plane.y = threshold.y
    plane.update(0.001, ctx) // touch down -> rolling with mult 2

    plane.update(CONFIG.runway.occupancySeconds, ctx) // normal duration: not done yet
    expect(plane.rolloutDone).toBe(false)
    plane.update(CONFIG.runway.occupancySeconds, ctx) // double duration reached
    expect(plane.rolloutDone).toBe(true)
  })

  it('turnaround multiplier shortens gate time (Express Taxiway perk)', () => {
    const plane = makePlane()
    const gate = new Gate(0)
    const ctx = makeCtx()
    ctx.turnaroundMult = 0.5
    gate.reserve(plane)
    plane.transition('holding')
    plane.ringIndex = 0
    plane.transition('landing')
    plane.transition('rolling')
    plane.rolloutDone = true
    plane.update(0.1, ctx)
    runUntil(plane, ctx, () => plane.state === 'at_gate')

    plane.update(CONFIG.gate.turnaroundSeconds * 0.5 + 0.1, ctx)
    expect(plane.state).toBe('boarding')
  })

  it('patience pauses during turnaround at the gate', () => {
    const plane = makePlane()
    const gate = new Gate(0)
    const ctx = makeCtx()
    gate.reserve(plane)
    plane.transition('holding')
    plane.ringIndex = 0
    plane.transition('landing')
    plane.transition('rolling')
    plane.rolloutDone = true
    plane.update(0.1, ctx) // -> taxiing
    runUntil(plane, ctx, () => plane.state === 'at_gate')

    const before = plane.patience
    plane.update(5, ctx) // turnaround ticking
    expect(plane.patience).toBe(before)
  })
})

describe('Size classes', () => {
  it('large planes are rejected by small runways and gates; small planes go anywhere', () => {
    const smallRunway = new Runway(0, 320, 330, -15, 'small')
    const largeRunway = new Runway(1, 480, 272, 0, 'large')
    const smallGate = new Gate(1) // id 1: not divisible by largeEvery
    const largeGate = new Gate(0) // id 0: large
    const big = new Plane(1, 'BG100', 0, 0, 100, 0, 'large')
    const little = new Plane(2, 'LT200', 0, 0, 100, 0, 'small')

    expect(smallRunway.canAccept(big)).toBe(false)
    expect(largeRunway.canAccept(big)).toBe(true)
    expect(smallRunway.canAccept(little)).toBe(true)
    expect(smallGate.canAccept(big)).toBe(false)
    expect(largeGate.canAccept(big)).toBe(true)
    expect(smallGate.canAccept(little)).toBe(true)

    // guarded entry points are no-ops on mismatch
    smallRunway.enqueue(big)
    expect(smallRunway.queue).toHaveLength(0)
    expect(big.assignedRunway).toBeNull()
    smallGate.reserve(big)
    expect(smallGate.free).toBe(true)
    expect(big.assignedGate).toBeNull()
  })

  it('every-3rd gate is large', () => {
    const gates = Array.from({ length: 12 }, (_, i) => new Gate(i))
    const largeIds = gates.filter((g) => g.size === 'large').map((g) => g.id)
    expect(largeIds).toEqual([0, 3, 6, 9])
  })
})

describe('Boarding departure window', () => {
  it('tracks overdue seconds and reports them at wheels-up', () => {
    const runway = new Runway(0, 320, 330, -15, 'large')
    const gate = new Gate(0)
    const plane = makePlane()
    const ctx = makeCtx()
    gate.reserve(plane)
    plane.transition('holding')
    plane.ringIndex = 0
    runway.enqueue(plane)
    runway.sequence()
    runUntil(plane, ctx, () => plane.state === 'boarding', 200)
    expect(plane.boardingStart).not.toBeNull()

    // wait out the full window plus 30 seconds
    ctx.shiftTime = plane.boardingStart! + CONFIG.gate.departWindowSeconds + 30
    plane.update(0.1, ctx)
    expect(plane.gateDelaySeconds).toBeCloseTo(30, 0)

    runway.enqueue(plane) // departure
    runUntil(plane, ctx, () => plane.atHoldShort, 60)
    runway.sequence()
    runUntil(plane, ctx, () => plane.wheelsUp, 60)
    const evt = ctx.events.find((e) => e.type === 'departed_ok')!
    expect(evt.type === 'departed_ok' && Math.round(evt.delaySeconds)).toBe(30)
  })

  it('departing within the window reports zero delay (D:00)', () => {
    const runway = new Runway(0, 320, 330, -15, 'large')
    const gate = new Gate(0)
    const plane = makePlane()
    const ctx = makeCtx()
    gate.reserve(plane)
    plane.transition('holding')
    plane.ringIndex = 0
    runway.enqueue(plane)
    runway.sequence()
    runUntil(plane, ctx, () => plane.state === 'boarding', 200)

    runway.enqueue(plane)
    runUntil(plane, ctx, () => plane.atHoldShort, 60)
    runway.sequence()
    runUntil(plane, ctx, () => plane.wheelsUp, 60)
    const evt = ctx.events.find((e) => e.type === 'departed_ok')!
    expect(evt.type === 'departed_ok' && evt.delaySeconds).toBe(0)
  })
})

describe('Vertical runway flow', () => {
  it('arrivals roll downward, departures roll upward away from the terminal', () => {
    const runway = new Runway(0, 480, 330, 90, 'large') // vertical strip
    const gate = new Gate(0)
    const plane = makePlane()
    const ctx = makeCtx()
    gate.reserve(plane)
    plane.transition('holding')
    plane.ringIndex = 0
    runway.enqueue(plane)
    runway.sequence()

    // arrival: touchdown at the top threshold, rollout moves DOWN toward the gates
    runUntil(plane, ctx, () => plane.state === 'rolling')
    const yAtTouchdown = plane.y
    plane.update(2, ctx)
    expect(plane.y).toBeGreaterThan(yAtTouchdown)

    runUntil(plane, ctx, () => plane.state === 'boarding', 200)
    runway.enqueue(plane)
    runUntil(plane, ctx, () => plane.atHoldShort, 60)
    // hold-short sits near the rollout end (bottom), not the top threshold
    expect(plane.y).toBeGreaterThan(runway.y)

    runway.sequence()
    expect(plane.state).toBe('departing')
    const yAtRollStart = plane.y
    plane.update(2, ctx)
    expect(plane.y).toBeLessThan(yAtRollStart) // takeoff roll moves UP, away from gates
  })
})

describe('Runway mixed queue', () => {
  it('serves a departure then an arrival in FIFO order', () => {
    const runway = new Runway(0, 130, 560, -20)
    const gate = new Gate(0)
    const departure = makePlane(CONFIG.plane.initialFuel, 1)
    const arrival = makePlane(CONFIG.plane.initialFuel, 2)
    const ctx = makeCtx()

    // get departure to boarding at the gate
    gate.reserve(departure)
    departure.transition('holding')
    departure.ringIndex = 0
    departure.transition('landing')
    departure.transition('rolling')
    departure.rolloutDone = true
    departure.update(0.1, ctx)
    runUntil(departure, ctx, () => departure.state === 'boarding')

    arrival.transition('holding')
    arrival.ringIndex = 0

    runway.enqueue(departure) // departure first in queue -> starts taxiing out
    runway.enqueue(arrival)

    // arrival must wait while the departure taxis to hold-short (strict FIFO)
    runway.sequence()
    expect(runway.current).toBeNull()
    expect(arrival.state).toBe('holding')

    runUntil(departure, ctx, () => departure.atHoldShort)
    runway.sequence()
    expect(departure.state).toBe('departing')

    // takeoff roll completes -> wheels up frees the runway -> arrival commits
    runUntil(departure, ctx, () => departure.wheelsUp, 60)
    runway.sequence()
    expect(arrival.state).toBe('landing')
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
})

describe('Gate', () => {
  it('V layout: symmetric arms, all gates above the apex, no overlaps', () => {
    const gates = Array.from({ length: 10 }, (_, i) => new Gate(i))
    const G = CONFIG.gate
    for (const g of gates) {
      expect(g.y).toBeLessThan(G.apexY)
      // even ids left of apex, odd ids right
      if (g.id % 2 === 0) expect(g.x).toBeLessThan(G.apexX)
      else expect(g.x).toBeGreaterThan(G.apexX)
    }
    // mirrored pairs sit at the same height
    expect(gates[0].y).toBeCloseTo(gates[1].y)
    expect(gates[8].y).toBeCloseTo(gates[9].y)
    // no two gates closer than a box width
    for (let i = 0; i < gates.length; i++) {
      for (let j = i + 1; j < gates.length; j++) {
        const d = Math.hypot(gates[i].x - gates[j].x, gates[i].y - gates[j].y)
        expect(d).toBeGreaterThan(G.sizePixels)
      }
    }
  })

  it('reserve, occupy, release lifecycle', () => {
    const gate = new Gate(0)
    const plane = makePlane()
    expect(gate.free).toBe(true)

    gate.reserve(plane)
    expect(gate.free).toBe(false)
    expect(gate.occupied).toBe(false) // reserved, not yet physically there
    expect(plane.assignedGate).toBe(gate)

    gate.release()
    expect(gate.free).toBe(true)
    expect(plane.assignedGate).toBeNull()
  })

  it('reassignment releases the previous gate', () => {
    const g1 = new Gate(0)
    const g2 = new Gate(1)
    const plane = makePlane()
    g1.reserve(plane)
    g2.reserve(plane)
    expect(g1.free).toBe(true)
    expect(g2.reservedBy).toBe(plane)
  })
})

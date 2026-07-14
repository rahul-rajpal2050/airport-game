import { CONFIG, hourToShiftSeconds, type PlaneSize } from '../../config'
import type { RNG } from '../../utils/rng'
import { Plane } from '../entities/plane'
import type { GameState } from '../state'

export interface SpawnEntry {
  time: number
  x: number
  y: number
  callsign: string
  fuel: number
  size: PlaneSize
  /** exactly one per shift: pays 5x on each on-time leg */
  golden?: boolean
}

/** Piecewise-linear lookup of planes-per-minute at time t */
export function rateAt(t: number, curve: readonly (readonly [number, number])[]): number {
  if (t <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [t1, r1] = curve[i]
    const [t0, r0] = curve[i - 1]
    if (t <= t1) return r0 + ((t - t0) / (t1 - t0)) * (r1 - r0)
  }
  return curve[curve.length - 1][1]
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I/O — too easy to misread

function rollCallsign(rng: RNG): string {
  return (
    LETTERS[rng.int(0, LETTERS.length - 1)] +
    LETTERS[rng.int(0, LETTERS.length - 1)] +
    String(rng.int(100, 999))
  )
}

function rollEdgePosition(rng: RNG): { x: number; y: number } {
  const { width, height } = CONFIG.canvas
  const m = CONFIG.approach.spawnEdgeMarginPixels
  const edge = rng.int(0, 2) // 0 = top, 1 = left, 2 = right (bottom is runway territory)
  if (edge === 0) return { x: rng.float(m, width - m), y: -m }
  if (edge === 1) return { x: -m, y: rng.float(m, height * 0.5) }
  return { x: width + m, y: rng.float(m, height * 0.5) }
}

/**
 * Pre-rolls the entire shift's spawn schedule from the seed.
 * This is the determinism contract: all RNG draws happen here, before frame 1,
 * so the same seed always produces the identical shift.
 */
export function generateSchedule(rng: RNG, rateMult = 1): SpawnEntry[] {
  const { durationSeconds } = CONFIG.shift
  // rush-hour waves are authored in clock hours; sample them in shift seconds
  const curve = CONFIG.shift.spawnCurveByHour.map(
    ([hour, rate]) => [hourToShiftSeconds(hour), rate] as [number, number]
  )
  const entries: SpawnEntry[] = []
  const rollEntry = (time: number): SpawnEntry => {
    const pos = rollEdgePosition(rng)
    return {
      time,
      x: pos.x,
      y: pos.y,
      callsign: rollCallsign(rng),
      // fuel is a % of the size's circling budget; some flights arrive short
      fuel: CONFIG.plane.initialFuel - rng.int(0, CONFIG.approach.fuelJitter),
      size: rng.next() < CONFIG.shift.largeProbability ? 'large' : 'small',
    }
  }

  let t = 0
  let first = true
  for (;;) {
    const rate = rateAt(t, curve) * rateMult
    const meanInterval = 60 / rate
    if (first) {
      // the opening arrival lands quickly so there's no dead gap at shift start
      t += rng.float(CONFIG.shift.firstArrivalSeconds[0], CONFIG.shift.firstArrivalSeconds[1])
      first = false
    } else {
      t += meanInterval * (0.5 + rng.next()) // jittered around the mean
    }
    if (t >= durationSeconds) break
    entries.push(rollEntry(t))

    // formation waves: in rush-level traffic, arrivals can bunch up. The next
    // interval stretches by the group size so the average rate is unchanged.
    let groupSize = 1
    const G = CONFIG.shift
    if (rate >= G.groupRushThreshold && rng.next() < G.groupProbability) {
      const extras = rng.int(1, G.groupExtraMax)
      for (let i = 0; i < extras; i++) {
        const offset = rng.float(G.groupSpacingSeconds[0], G.groupSpacingSeconds[1]) * (i + 1)
        if (t + offset < durationSeconds) {
          entries.push(rollEntry(t + offset))
          groupSize++
        }
      }
    }
    if (groupSize > 1) {
      const rateAfter = rateAt(t, curve) * rateMult
      t += (60 / rateAfter) * (0.5 + rng.next()) * (groupSize - 1)
    }
  }
  // exactly one golden flight per shift (seeded draw appended after all others,
  // so the existing draw order — and every schedule before this point — is unchanged)
  if (entries.length > 0) entries[rng.int(0, entries.length - 1)].golden = true
  return entries
}

let nextPlaneId = 1

export function resetPlaneIds(): void {
  nextPlaneId = 1
}

/** Consume schedule entries whose time has arrived */
export function updateSpawns(state: GameState): void {
  while (
    state.scheduleIndex < state.schedule.length &&
    state.schedule[state.scheduleIndex].time <= state.shiftTime
  ) {
    const e = state.schedule[state.scheduleIndex++]
    const plane = new Plane(nextPlaneId++, e.callsign, e.x, e.y, e.fuel, e.time, e.size, e.golden)
    if (state.nextSpawnKind !== null) {
      plane.kind = state.nextSpawnKind
      state.nextSpawnKind = null
      if (plane.kind === 'vip' && state.vipPriority) {
        // red carpet: straight to the front of the emptier runway's queue
        const emptier = state.runways.reduce((a, b) => (a.queue.length <= b.queue.length ? a : b))
        plane.assignedRunway = emptier
        emptier.queue.unshift(plane)
        state.vipPriority = false
      }
    }
    state.planes.push(plane)
    state.events.push({ type: 'spawned', plane })
  }
}

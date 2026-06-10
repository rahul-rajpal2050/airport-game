import { describe, expect, it } from 'bun:test'
import { CONFIG } from '../../config'
import { RNG } from '../../utils/rng'
import { generateSchedule, rateAt } from './spawn'

describe('generateSchedule', () => {
  it('same seed produces an identical schedule (determinism contract)', () => {
    const a = generateSchedule(new RNG('2026-06-10'))
    const b = generateSchedule(new RNG('2026-06-10'))
    expect(a).toEqual(b)
  })

  it('different seeds produce different schedules', () => {
    const a = generateSchedule(new RNG('2026-06-10'))
    const b = generateSchedule(new RNG('2026-06-11'))
    expect(a).not.toEqual(b)
  })

  it('spawn times are monotonic and within the shift', () => {
    const schedule = generateSchedule(new RNG(4471))
    expect(schedule.length).toBeGreaterThan(0)
    for (let i = 0; i < schedule.length; i++) {
      expect(schedule[i].time).toBeGreaterThan(0)
      expect(schedule[i].time).toBeLessThan(CONFIG.shift.durationSeconds)
      if (i > 0) expect(schedule[i].time).toBeGreaterThan(schedule[i - 1].time)
    }
  })

  it('fuel stays within jitter bounds', () => {
    const { initialFuel } = CONFIG.plane
    const { fuelJitter } = CONFIG.approach
    for (const entry of generateSchedule(new RNG(7))) {
      expect(entry.fuel).toBeGreaterThanOrEqual(initialFuel - fuelJitter)
      expect(entry.fuel).toBeLessThanOrEqual(initialFuel + fuelJitter)
    }
  })
})

describe('rateAt', () => {
  const curve = CONFIG.shift.spawnCurve

  it('returns curve endpoints outside the range', () => {
    expect(rateAt(-5, curve)).toBe(curve[0][1])
    expect(rateAt(9999, curve)).toBe(curve[curve.length - 1][1])
  })

  it('interpolates linearly between points', () => {
    // curve has [120, 4] and [180, 6]; midpoint 150 should be 5
    expect(rateAt(150, curve)).toBe(5)
  })
})

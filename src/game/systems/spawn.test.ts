import { describe, expect, it } from 'bun:test'
import { CONFIG, clockHourAt, hourToShiftSeconds } from '../../config'
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

  it('group arrivals form in rush hours, never in the quiet open', () => {
    let foundGroup = false
    for (let seed = 0; seed < 20; seed++) {
      const schedule = generateSchedule(new RNG(seed))
      const morningRushStart = hourToShiftSeconds(7)
      for (let i = 1; i < schedule.length; i++) {
        const gap = schedule[i].time - schedule[i - 1].time
        if (gap < 5) {
          foundGroup = true
          // bunched arrivals only exist at rush-level traffic, not the 6-7am warm-up
          expect(schedule[i].time).toBeGreaterThan(morningRushStart)
        }
      }
    }
    expect(foundGroup).toBe(true)
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

describe('clock mapping', () => {
  it('maps shift seconds to the 06:00-22:00 day', () => {
    const { durationSeconds, dayStartHour, dayEndHour } = CONFIG.shift
    expect(clockHourAt(0)).toBe(dayStartHour)
    expect(clockHourAt(durationSeconds)).toBe(dayEndHour)
    expect(clockHourAt(durationSeconds / 2)).toBe((dayStartHour + dayEndHour) / 2)
    expect(clockHourAt(durationSeconds * 2)).toBe(dayEndHour) // clamped
  })

  it('hourToShiftSeconds inverts clockHourAt', () => {
    for (const h of [6, 9.5, 14, 22]) {
      expect(clockHourAt(hourToShiftSeconds(h))).toBeCloseTo(h)
    }
  })

  it('rush hours spawn more than lulls', () => {
    const curve = CONFIG.shift.spawnCurveByHour.map(
      ([h, r]) => [hourToShiftSeconds(h), r] as [number, number]
    )
    const rush = rateAt(hourToShiftSeconds(8), curve) // morning rush
    const lull = rateAt(hourToShiftSeconds(10), curve)
    const eveningRush = rateAt(hourToShiftSeconds(20), curve)
    expect(rush).toBeGreaterThan(lull * 1.5)
    expect(eveningRush).toBeGreaterThanOrEqual(rush) // the day's hardest
  })
})

describe('rateAt', () => {
  // local fixture so retuning CONFIG.shift.spawnCurve never breaks this test
  const curve: [number, number][] = [
    [0, 2],
    [120, 4],
    [180, 6],
  ]

  it('returns curve endpoints outside the range', () => {
    expect(rateAt(-5, curve)).toBe(curve[0][1])
    expect(rateAt(9999, curve)).toBe(curve[curve.length - 1][1])
  })

  it('interpolates linearly between points', () => {
    expect(rateAt(150, curve)).toBe(5)
  })
})

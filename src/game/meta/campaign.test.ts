import { beforeEach, describe, expect, it } from 'bun:test'
import { CONFIG } from '../../config'
import { getState } from '../loop'
import { newStats } from '../state'
import {
  advance,
  draftChoices,
  draftPerk,
  getRun,
  getSettings,
  getUi,
  getLastShiftRecord,
  getRecords,
  modifiersFor,
  processShiftEnd,
  recordShiftResult,
  reputationDelta,
  resetCampaign,
  runAvgSatisfaction,
  startDailyChallenge,
  startFreeShift,
  startRun,
  updateSettings,
} from './campaign'
import { dailySeed } from '../../utils/rng'
import { setStorageBackend, type StorageBackend } from './storage'

function memoryBackend(): StorageBackend {
  let mem: string | null = null
  return { get: () => mem, set: (v) => (mem = v) }
}

function statsWith(overrides: Partial<ReturnType<typeof newStats>>) {
  return { ...newStats(), ...overrides }
}

beforeEach(() => {
  setStorageBackend(memoryBackend())
  resetCampaign()
})

describe('personal bests and daily streak', () => {
  const perfect = () => statsWith({ landed: 5, arrivedOnTime: 5, departed: 5, departedOnTime: 5 })
  const mediocre = () => statsWith({ landed: 5, arrivedOnTime: 5, departed: 5, departedOnTime: 5, raged: 4 }) // 80%

  it('detects a new best, then measures the shortfall against it', () => {
    startFreeShift()
    recordShiftResult(perfect()) // 100%
    expect(getLastShiftRecord()!.isNewBest).toBe(true)
    expect(getRecords().bestSatisfaction).toBe(100)

    recordShiftResult(mediocre()) // 80% < 100%
    const rec = getLastShiftRecord()!
    expect(rec.isNewBest).toBe(false)
    expect(rec.prevBestSatisfaction).toBe(100)
    expect(getRecords().bestSatisfaction).toBe(100)
  })

  it('free shifts never touch the daily streak', () => {
    startFreeShift()
    recordShiftResult(perfect())
    expect(getRecords().dailyStreak.count).toBe(0)
    expect(getLastShiftRecord()!.dailyStreak).toBeNull()
  })

  it('daily streak: first day, same-day replay, consecutive day, and gap reset', () => {
    const today = dailySeed()
    const yesterday = (() => {
      const d = new Date(`${today}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() - 1)
      return d.toISOString().slice(0, 10)
    })()

    startDailyChallenge()
    recordShiftResult(perfect())
    expect(getRecords().dailyStreak).toEqual({ count: 1, lastDay: today })

    recordShiftResult(perfect()) // same-day replay: unchanged
    expect(getRecords().dailyStreak.count).toBe(1)

    getRecords().dailyStreak.count = 3
    getRecords().dailyStreak.lastDay = yesterday // pretend last play was yesterday
    recordShiftResult(perfect())
    expect(getRecords().dailyStreak).toEqual({ count: 4, lastDay: today })

    getRecords().dailyStreak.lastDay = '2020-01-01' // long gap: reset
    recordShiftResult(perfect())
    expect(getRecords().dailyStreak).toEqual({ count: 1, lastDay: today })
  })
})

describe('run satisfaction average', () => {
  it('accumulates each shift and averages over shifts played', () => {
    startRun()
    // perfect shift (100%) then a one-complaint shift
    processShiftEnd(statsWith({ landed: 4, arrivedOnTime: 4, departed: 4, departedOnTime: 4 }))
    advance() // to draft
    draftPerk(null) // next shift
    processShiftEnd(statsWith({ landed: 4, arrivedOnTime: 4, departed: 4, departedOnTime: 4, raged: 1 }))
    const run = getRun()!
    // shift 1 = 100, shift 2 = 100 - 5 (one complaint) = 95 -> avg 97.5 -> 98
    expect(runAvgSatisfaction(run)).toBe(98)
  })
})

describe('reputationDelta', () => {
  const archetype = CONFIG.campaign.archetypes[0]

  it('rewards on-time departures, punishes rage and diversions', () => {
    const R = CONFIG.reputation
    const delta = reputationDelta(statsWith({ departedOnTime: 10, raged: 2, diverted: 1 }), archetype)
    expect(delta).toBe(10 * R.onTimeDelta + 2 * R.delayDelta + 1 * R.diversionDelta)
  })

  it('VIP Day doubles the delta', () => {
    const vipDay = CONFIG.campaign.archetypes.find((a) => a.repDeltaMult === 2)!
    const base = reputationDelta(statsWith({ departedOnTime: 5 }), archetype)
    expect(reputationDelta(statsWith({ departedOnTime: 5 }), vipDay)).toBe(base * 2)
  })
})

describe('run lifecycle', () => {
  it('a run survives five shifts to victory', () => {
    startRun()
    for (let i = 0; i < CONFIG.campaign.shiftsPerRun; i++) {
      processShiftEnd(statsWith({ departedOnTime: 5, score: 1000 }))
      const ui = getUi()!
      if (i < CONFIG.campaign.shiftsPerRun - 1) {
        expect(ui.outcome).toBeNull()
        advance()
        expect(getUi()!.screen).toBe('draft')
        draftPerk(null) // skip, next shift starts
      } else {
        expect(ui.outcome).toBe('victory')
      }
    }
    expect(getRun()!.runScore).toBe(5000)
  })

  it('reputation collapse fires you mid-run', () => {
    startRun()
    // catastrophic shift: rep 75 + (20 raged * -3) + (5 diverted * -8) = 75 - 100 -> clamped 0
    processShiftEnd(statsWith({ raged: 20, diverted: 5 }))
    expect(getRun()!.reputation).toBe(CONFIG.reputation.min)
    expect(getUi()!.outcome).toBe('fired')
  })

  it('reputation clamps at the max', () => {
    startRun()
    processShiftEnd(statsWith({ departedOnTime: 50 }))
    expect(getRun()!.reputation).toBe(CONFIG.reputation.max)
  })
})

describe('perk draft', () => {
  it('choices are deterministic per run seed and shift, and exclude owned perks', () => {
    startRun()
    const first = draftChoices().map((p) => p.id)
    expect(draftChoices().map((p) => p.id)).toEqual(first) // stable
    expect(first.length).toBe(CONFIG.perks.draftSize)

    draftPerk(first[0])
    processShiftEnd(statsWith({ departedOnTime: 3 }))
    advance()
    const second = draftChoices().map((p) => p.id)
    expect(second).not.toContain(first[0]) // owned perks excluded
  })

  it('drafting pays the reputation cost and applies modifiers', () => {
    startRun()
    const radar = CONFIG.perks.defs.find((p) => p.id === 'weather_radar')!
    const repBefore = getRun()!.reputation
    draftPerk('weather_radar')
    expect(getRun()!.reputation).toBe(repBefore - radar.repCost)
    expect(modifiersFor(getRun()!).eventWarningSeconds).toBe(60)
  })

  it('cannot draft a perk you cannot afford', () => {
    startRun()
    getRun()!.reputation = 5
    draftPerk('third_runway') // costs 20
    expect(getRun()!.perkIds).toHaveLength(0)
    expect(getRun()!.reputation).toBe(5)
  })

  it('modifiers stack multiplicatively for mults and additively for counts', () => {
    startRun()
    getRun()!.perkIds = ['express_taxiway', 'third_runway', 'seventh_gate']
    const m = modifiersFor(getRun()!)
    expect(m.turnaroundMult).toBeCloseTo(0.7)
    expect(m.extraRunways).toBe(1)
    expect(m.extraGates).toBe(1)
    expect(m.fuelDrainMult).toBe(1)
  })
})

describe('settings', () => {
  it('runway count setting controls the row: 2, 3, or 5, center always large', () => {
    for (const n of [2, 3, 5]) {
      updateSettings({ runwayCount: n })
      startFreeShift()
      expect(getState().runways.length).toBe(n)
      expect(getState().runways[0].size).toBe('large')
      expect(getState().runways.filter((r) => r.size === 'large').length).toBe(1)
    }
  })

  it('difficulty no longer changes runway count, only traffic', () => {
    updateSettings({ runwayCount: 3, difficulty: 'hard' })
    startFreeShift()
    expect(getState().runways.length).toBe(3)
    updateSettings({ difficulty: 'easy' })
    startFreeShift()
    expect(getState().runways.length).toBe(3)
  })

  it('runway perk on the full row clamps at available positions', () => {
    updateSettings({ runwayCount: 5 })
    startRun()
    getRun()!.perkIds = ['third_runway'] // +1 = 6, but only 5 positions exist
    draftPerk(null) // skip the draft; starts the next shift with current perks
    expect(getState().runways.length).toBe(CONFIG.runway.positions.length)
  })

  it('gate count setting flows into the shift (default 10, perk adds one)', () => {
    expect(getSettings().gateCount).toBe(10)
    startFreeShift()
    expect(getState().gates.length).toBe(10)

    updateSettings({ gateCount: 6 })
    startFreeShift()
    expect(getState().gates.length).toBe(6)

    updateSettings({ gateCount: 12 })
    startRun()
    getRun()!.perkIds = ['seventh_gate']
    draftPerk(null)
    expect(getState().gates.length).toBe(13)
  })

  it('near-miss toggle flows into shift state', () => {
    updateSettings({ nearMisses: false })
    startFreeShift()
    expect(getState().nearMissesEnabled).toBe(false)
    expect(getSettings().nearMisses).toBe(false)

    updateSettings({ nearMisses: true })
    startFreeShift()
    expect(getState().nearMissesEnabled).toBe(true)
  })
})

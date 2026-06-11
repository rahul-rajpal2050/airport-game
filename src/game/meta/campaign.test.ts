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
  modifiersFor,
  processShiftEnd,
  reputationDelta,
  resetCampaign,
  startFreeShift,
  startRun,
  updateSettings,
} from './campaign'
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
  it('difficulty controls runway count: easy 3, normal 2, hard 1', () => {
    updateSettings({ difficulty: 'easy' })
    startFreeShift()
    expect(getState().runways.length).toBe(3)

    updateSettings({ difficulty: 'normal' })
    startFreeShift()
    expect(getState().runways.length).toBe(2)

    updateSettings({ difficulty: 'hard' })
    startFreeShift()
    expect(getState().runways.length).toBe(1)
  })

  it('hard cannot go below one runway even stacked with archetype closures', () => {
    updateSettings({ difficulty: 'hard' })
    startFreeShift()
    expect(getState().runways.length).toBeGreaterThanOrEqual(1)
  })

  it('third runway perk on easy clamps at available runway positions', () => {
    updateSettings({ difficulty: 'easy' }) // +1 runway
    startRun()
    getRun()!.perkIds = ['third_runway'] // +1 more = 4, but only 3 positions exist
    draftPerk(null) // skip the draft; starts the next shift with current perks
    expect(getState().runways.length).toBe(CONFIG.runway.positions.length)
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

import { CONFIG, identityModifiers, type Modifiers, type PerkDef, type ShiftArchetype } from '../../config'
import { dailySeed, RNG, randomSessionSeed } from '../../utils/rng'
import { getState, onShiftEnd, returnToMenu, startShift } from '../loop'
import { gameStore, type ShiftStats } from '../state'
import { satisfactionOf } from '../systems/scoring'
import { fetchTop, submitScore } from './leaderboard'
import { emptySave, loadSave, persistSave, type RunState, type SaveData, type Settings } from './storage'

onShiftEnd((stats) => {
  recordShiftResult(stats) // every mode: personal bests + daily streak
  processShiftEnd(stats) // campaign-only bookkeeping
})

export type CampaignScreen = 'score' | 'draft' | 'summary'

interface CampaignUiState {
  screen: CampaignScreen
  lastRepDelta: number
  outcome: 'victory' | 'fired' | null
}

let save: SaveData = loadSave()
let active = false
let ui: CampaignUiState | null = null

export function isCampaignActive(): boolean {
  return active
}

export function getRun(): RunState | null {
  return save.run
}

export function getRecords(): SaveData['records'] {
  return save.records
}

export function getUi(): CampaignUiState | null {
  return ui
}

export function hasSavedRun(): boolean {
  return save.run !== null
}

export function getSettings(): Settings {
  return save.settings
}

export function updateSettings(patch: Partial<Settings>): void {
  save.settings = { ...save.settings, ...patch }
  persistSave(save)
  gameStore.notify()
}

/**
 * Daily challenge: everyone worldwide plays the identical seeded shift today,
 * so leaderboard scores are directly comparable. Settings still apply — the
 * leaderboard shows raw results, friendly rivalry handles the rest.
 */
export function startDailyChallenge(): void {
  const seed = dailySeed()
  startSeededShift(seed)
  // race the leader: show today's top satisfaction in the HUD once it loads
  void fetchTop({ seed, limit: 1 }).then((rows) => {
    const state = getState()
    if (rows && rows.length > 0 && String(state.seed) === seed && state.phase === 'active') {
      state.hudTarget = rows[0].satisfaction
    }
  })
}

/** One-off shift outside the campaign, honoring difficulty + toggles */
export function startFreeShift(): void {
  startSeededShift(randomSessionSeed())
}

function startSeededShift(seed: number | string): void {
  active = false
  ui = null
  const diff = CONFIG.difficulty[save.settings.difficulty]
  startShift(seed, {
    modifiers: identityModifiers(),
    spawnRateMult: diff.spawnRateMult,
    nearMisses: save.settings.nearMisses,
    gateCount: save.settings.gateCount,
    runwayCount: save.settings.runwayCount,
  })
}

function shiftSeed(run: RunState): string {
  return `${run.runSeed}-shift${run.shiftIndex}`
}

export function currentArchetype(run: RunState): ShiftArchetype {
  const list = CONFIG.campaign.archetypes
  return list[Math.min(run.shiftIndex, list.length - 1)]
}

export function modifiersFor(run: RunState): Modifiers {
  const m = identityModifiers()
  for (const id of run.perkIds) {
    const perk = CONFIG.perks.defs.find((p) => p.id === id)
    if (!perk) continue
    for (const [key, value] of Object.entries(perk.modifiers) as [keyof Modifiers, number][]) {
      if (key === 'extraRunways' || key === 'extraGates' || key === 'eventWarningSeconds') {
        m[key] += value
      } else {
        m[key] *= value
      }
    }
  }
  return m
}

export function startRun(): void {
  save.run = {
    runSeed: `run-${randomSessionSeed()}`,
    shiftIndex: 0,
    reputation: CONFIG.reputation.initial,
    perkIds: [],
    runScore: 0,
    satisfactionSum: 0,
  }
  persistSave(save)
  beginShift()
}

export function continueRun(): void {
  if (!save.run) return
  beginShift()
}

function beginShift(): void {
  const run = save.run
  if (!run) return
  active = true
  ui = null
  const diff = CONFIG.difficulty[save.settings.difficulty]
  startShift(shiftSeed(run), {
    modifiers: modifiersFor(run),
    archetype: currentArchetype(run),
    hudReputation: run.reputation,
    spawnRateMult: diff.spawnRateMult,
    nearMisses: save.settings.nearMisses,
    gateCount: save.settings.gateCount,
    runwayCount: save.settings.runwayCount,
  })
}

export interface LastShiftRecord {
  isNewBest: boolean
  prevBestSatisfaction: number
  /** streak count after this shift, if it was a daily-challenge shift */
  dailyStreak: number | null
}

let lastShiftRecord: LastShiftRecord | null = null

export function getLastShiftRecord(): LastShiftRecord | null {
  return lastShiftRecord
}

function previousDay(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00Z`) // noon avoids DST edges
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Runs for EVERY completed shift (free, daily, campaign): bests + daily streak */
export function recordShiftResult(stats: ShiftStats): void {
  const satisfaction = satisfactionOf(stats)
  const prevBest = save.records.bestSatisfaction
  const isNewBest = satisfaction > prevBest
  if (isNewBest) save.records.bestSatisfaction = satisfaction
  save.records.bestShiftScore = Math.max(save.records.bestShiftScore, Math.round(stats.score))

  let streakForScreen: number | null = null
  if (String(getState().seed) === dailySeed()) {
    const today = dailySeed()
    const streak = save.records.dailyStreak
    if (streak.lastDay !== today) {
      streak.count = streak.lastDay === previousDay(today) ? streak.count + 1 : 1
      streak.lastDay = today
    }
    streakForScreen = streak.count
  }

  lastShiftRecord = { isNewBest, prevBestSatisfaction: prevBest, dailyStreak: streakForScreen }
  persistSave(save)
}

/** Reputation delta from shift stats, scaled by the archetype (VIP Day x2) */
export function reputationDelta(stats: ShiftStats, archetype: ShiftArchetype): number {
  const R = CONFIG.reputation
  const raw =
    stats.departedOnTime * R.onTimeDelta +
    stats.raged * R.delayDelta +
    stats.diverted * R.diversionDelta
  return Math.round(raw * (archetype.repDeltaMult ?? 1))
}

/** Called by the gameStore listener when a campaign shift reaches post_shift */
export function processShiftEnd(stats: ShiftStats): void {
  const run = save.run
  if (!run || !active) return
  const archetype = currentArchetype(run)
  const delta = reputationDelta(stats, archetype)

  run.reputation = Math.max(
    CONFIG.reputation.min,
    Math.min(CONFIG.reputation.max, run.reputation + delta)
  )
  run.runScore += stats.score
  run.satisfactionSum += satisfactionOf(stats)
  run.shiftIndex++
  // bestShiftScore is handled by recordShiftResult for every mode

  const fired = run.reputation <= CONFIG.reputation.min
  const victory = !fired && run.shiftIndex >= CONFIG.campaign.shiftsPerRun
  ui = {
    screen: 'score',
    lastRepDelta: delta,
    outcome: fired ? 'fired' : victory ? 'victory' : null,
  }
  persistSave(save)
}

/** Score screen Continue button: to the draft, or to the run summary if the run ended */
export function advance(): void {
  if (!ui) return
  if (ui.outcome) {
    finishRun()
    ui = { ...ui, screen: 'summary' }
  } else {
    ui = { ...ui, screen: 'draft' }
  }
  gameStore.notify()
}

function finishRun(): void {
  const run = save.run
  if (!run) return
  save.records.bestRunScore = Math.max(save.records.bestRunScore, run.runScore)
  if (ui?.outcome === 'victory') save.records.runsCompleted++
  persistSave(save)
}

/** Average satisfaction across the shifts played this run (0 if none) */
export function runAvgSatisfaction(run: RunState): number {
  return run.shiftIndex > 0 ? Math.round(run.satisfactionSum / run.shiftIndex) : 0
}

/** Post the completed run total to the leaderboard under the saved player name */
export function submitRun(): Promise<boolean> {
  const run = save.run
  if (!run) return Promise.resolve(false)
  return submitScore({
    name: save.settings.playerName || 'Pilot',
    satisfaction: runAvgSatisfaction(run),
    opsScore: run.runScore,
    seed: run.runSeed, // 'run-...' seed keeps these in All-Time, out of the daily board
  })
}

/** Deterministic 3-perk draft for the upcoming shift; excludes owned perks */
export function draftChoices(): PerkDef[] {
  const run = save.run
  if (!run) return []
  const pool = CONFIG.perks.defs.filter((p) => !run.perkIds.includes(p.id))
  const rng = new RNG(`${run.runSeed}-draft${run.shiftIndex}`)
  const picks: PerkDef[] = []
  const candidates = [...pool]
  while (picks.length < CONFIG.perks.draftSize && candidates.length > 0) {
    picks.push(candidates.splice(rng.int(0, candidates.length - 1), 1)[0])
  }
  return picks
}

/** Pick a perk (pays reputation) or pass null to skip, then start the next shift */
export function draftPerk(perkId: string | null): void {
  const run = save.run
  if (!run) return
  if (perkId) {
    const perk = CONFIG.perks.defs.find((p) => p.id === perkId)
    if (perk && run.reputation > perk.repCost && !run.perkIds.includes(perk.id)) {
      run.reputation -= perk.repCost
      run.perkIds.push(perk.id)
    }
  }
  persistSave(save)
  beginShift()
  gameStore.notify()
}

/** Run summary dismissed: clear the run, back to menu */
export function closeRun(): void {
  save.run = null
  active = false
  ui = null
  persistSave(save)
  returnToMenu()
}

export function abandonRun(): void {
  closeRun()
}

/** Test hook: reload save from the backend (after setStorageBackend) */
export function reloadSave(): void {
  save = loadSave()
  active = false
  ui = null
}

/** Test hook: wipe everything */
export function resetCampaign(): void {
  save = emptySave()
  persistSave(save)
  active = false
  ui = null
}

import { CONFIG } from '../../config'
import type { GameState, ShiftStats } from '../state'

/**
 * The headline score: passenger satisfaction, 0-100.
 * Weighted blend of the two punctuality KPIs minus complaints (rage + diversions).
 * Components without data yet are neutral - a 30-second shift isn't 0% satisfied.
 */
export function satisfactionOf(stats: ShiftStats): number {
  const S = CONFIG.satisfaction
  const a00 = stats.landed > 0 ? stats.arrivedOnTime / stats.landed : 1
  const d00 = stats.departed > 0 ? stats.departedOnTime / stats.departed : 1
  const complaints = stats.raged + stats.diverted
  const raw = 100 * (S.weightArrivals * a00 + S.weightDepartures * d00) - S.complaintPenalty * complaints
  return Math.max(0, Math.min(100, Math.round(raw)))
}

/** Consume this frame's events into score and stats (sim hands them to juice after) */
export function applyScoring(state: GameState, dt: number): void {
  const S = CONFIG.scoring

  // overdue boarding planes bleed score continuously — "the score keeps dropping"
  for (const plane of state.planes) {
    if (plane.state === 'boarding' && plane.gateDelaySeconds > 0) {
      state.stats.score -= S.overdueDripPerSecond * dt
    }
  }

  for (const event of state.events) {
    switch (event.type) {
      case 'landed': {
        // A:00 - on time iff it touched down within the scheduled arrival window
        const arrivedOnTime =
          state.shiftTime <= event.plane.spawnTime + CONFIG.satisfaction.arrivalWindowSeconds
        if (arrivedOnTime) state.stats.arrivedOnTime++
        const frac = Math.max(event.plane.patience / CONFIG.plane.initialPatience, S.minLandingFraction)
        const kindMult = event.plane.kind === 'vip' ? CONFIG.events.vip.scoreMult : 1
        // golden jackpot: only an ON-TIME landing earns the multiplier
        const goldenMult = event.plane.golden && arrivedOnTime ? S.goldenMult : 1
        state.stats.score += Math.round(S.landingBase * frac * kindMult * goldenMult)
        if (
          event.plane.kind === 'medical' &&
          event.plane.kindDeadline !== null &&
          state.shiftTime <= event.plane.kindDeadline
        ) {
          state.stats.score += CONFIG.events.medical.onTimeLandBonus
        }
        state.stats.landed++
        break
      }
      case 'departed_ok': {
        const frac = Math.max(1 - event.delaySeconds * S.lateMultiplierPerSecond, S.minLandingFraction)
        const kindMult = event.plane.kind === 'vip' ? CONFIG.events.vip.scoreMult : 1
        const onTime = event.delaySeconds <= S.onTimeThresholdSeconds
        // on-time combo: consecutive on-time departures multiply the payout; a late one breaks it
        if (onTime) {
          state.onTimeCombo++
          state.stats.bestCombo = Math.max(state.stats.bestCombo, state.onTimeCombo)
        } else {
          state.onTimeCombo = 0
        }
        const comboMult = onTime
          ? Math.min(1 + (state.onTimeCombo - 1) * S.comboStep, S.comboMaxMult)
          : 1
        // golden jackpot: only an ON-TIME departure earns the multiplier
        const goldenMult = event.plane.golden && onTime ? S.goldenMult : 1
        state.stats.score += Math.round(S.departBase * frac * kindMult * goldenMult * comboMult)
        state.stats.departed++
        // D:00 — on time iff it left the gate within the departure window
        if (onTime) {
          state.stats.score += S.onTimeBonus
          state.stats.departedOnTime++
        }
        if (event.delaySeconds > state.stats.worstDelaySeconds) {
          state.stats.worstDelaySeconds = event.delaySeconds
          state.stats.worstDelayCallsign = event.plane.callsign
        }
        break
      }
      case 'diverted': {
        const kindMult = event.plane.kind === 'medical' ? CONFIG.events.medical.divertPenaltyMult : 1
        state.stats.score -= Math.round(S.diversionPenalty * kindMult)
        state.stats.diverted++
        state.streak = 0
        break
      }
      case 'raged': {
        const kindMult = event.plane.kind === 'vip' ? CONFIG.events.vip.ragePenaltyMult : 1
        state.stats.score -= Math.round(S.ragePenalty * kindMult)
        state.stats.raged++
        state.streak = 0
        break
      }
      case 'fuel_out':
        state.stats.gameOverCallsign = event.plane.callsign
        break
      case 'rerouted':
        // a deliberate operational call: ops cost only, not a complaint
        state.stats.score -= S.reroutePenalty
        state.stats.rerouted++
        break
      case 'near_miss': {
        state.streak++
        state.stats.nearMisses++
        state.stats.bestStreak = Math.max(state.stats.bestStreak, state.streak)
        const mult = 1 + (state.streak - 1) * S.streakMultiplierStep
        state.stats.score += Math.round(S.nearMissBonus * mult)
        break
      }
    }
    if (
      (event.type === 'landed' || event.type === 'diverted') &&
      event.plane.holdSeconds > state.stats.longestHoldSeconds
    ) {
      state.stats.longestHoldSeconds = event.plane.holdSeconds
      state.stats.longestHoldCallsign = event.plane.callsign
    }
  }
}

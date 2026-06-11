import { CONFIG } from '../../config'
import type { GameState } from '../state'

/** Consume this frame's events into score and stats (sim hands them to juice after) */
export function applyScoring(state: GameState): void {
  const S = CONFIG.scoring
  for (const event of state.events) {
    switch (event.type) {
      case 'landed': {
        const frac = Math.max(event.plane.patience / CONFIG.plane.initialPatience, S.minLandingFraction)
        const kindMult = event.plane.kind === 'vip' ? CONFIG.events.vip.scoreMult : 1
        state.stats.score += Math.round(S.landingBase * frac * kindMult)
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
        state.stats.score += Math.round(S.departBase * frac * kindMult)
        state.stats.departed++
        if (event.delaySeconds <= S.onTimeThresholdSeconds) {
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

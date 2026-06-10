import { CONFIG } from '../../config'
import type { GameState } from '../state'

/** Consume this frame's events into score and stats, then clear the list */
export function applyScoring(state: GameState): void {
  const S = CONFIG.scoring
  for (const event of state.events) {
    switch (event.type) {
      case 'landed': {
        const frac = Math.max(event.plane.patience / CONFIG.plane.initialPatience, S.minLandingFraction)
        state.stats.score += Math.round(S.landingBase * frac)
        state.stats.landed++
        break
      }
      case 'departed_ok': {
        const frac = Math.max(1 - event.delaySeconds * S.lateMultiplierPerSecond, S.minLandingFraction)
        state.stats.score += Math.round(S.departBase * frac)
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
      case 'diverted':
        state.stats.score -= S.diversionPenalty
        state.stats.diverted++
        state.streak = 0
        break
      case 'raged':
        state.stats.score -= S.ragePenalty
        state.stats.raged++
        state.streak = 0
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
  state.events.length = 0
}

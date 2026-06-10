import { CONFIG } from '../../config'
import type { GameState } from '../state'

/** Consume this frame's events into score and stats, then clear the list */
export function applyScoring(state: GameState): void {
  for (const event of state.events) {
    const plane = event.plane
    if (event.type === 'landed') {
      const patienceFrac = plane.patience / CONFIG.plane.initialPatience
      const frac = Math.max(patienceFrac, CONFIG.scoring.minLandingFraction)
      state.stats.score += Math.round(CONFIG.scoring.landingBase * frac)
      state.stats.landed++
    } else if (event.type === 'diverted') {
      state.stats.score -= CONFIG.scoring.diversionPenalty
      state.stats.diverted++
    }
    if (
      (event.type === 'landed' || event.type === 'diverted') &&
      plane.holdSeconds > state.stats.longestHoldSeconds
    ) {
      state.stats.longestHoldSeconds = plane.holdSeconds
      state.stats.longestHoldCallsign = plane.callsign
    }
  }
  state.events.length = 0
}

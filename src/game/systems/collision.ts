import { CONFIG } from '../../config'
import type { Plane } from '../entities/plane'
import type { GameState } from '../state'

function isAirborne(p: Plane): boolean {
  return (
    p.state === 'approaching' ||
    p.state === 'holding' ||
    p.state === 'landing' ||
    (p.state === 'departing' && p.wheelsUp)
  )
}

/** Stable holding-ring separation is not a near-miss; crossing traffic is */
function isCrossing(p: Plane): boolean {
  return p.state !== 'holding'
}

/**
 * Near-miss detection: two airborne planes brush within thresholdPixels while
 * at least one is crossing traffic. Fires once per pair per cooldown window.
 */
export function detectNearMisses(state: GameState): void {
  const threshold = CONFIG.nearMiss.thresholdPixels
  const airborne = state.planes.filter(isAirborne)
  for (let i = 0; i < airborne.length; i++) {
    for (let j = i + 1; j < airborne.length; j++) {
      const a = airborne[i]
      const b = airborne[j]
      if (!isCrossing(a) && !isCrossing(b)) continue
      if (Math.hypot(a.x - b.x, a.y - b.y) >= threshold) continue

      const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`
      const last = state.nearMissPairs.get(key)
      if (last !== undefined && state.shiftTime - last < CONFIG.nearMiss.cooldownSeconds) continue

      state.nearMissPairs.set(key, state.shiftTime)
      state.events.push({ type: 'near_miss', a, b })
      state.slowMoMs = CONFIG.nearMiss.slowMoDurationMs
    }
  }
}

import { CONFIG } from '../../config'
import type { GameState } from '../state'
import { playAlarm, playBuzz, playChime, playRadioBlip, playTakeoff, playThunk, playWhoosh } from './audio'

function shake(state: GameState, intensity: number, durationMs: number): void {
  // a bigger shake always wins over a fading one
  if (intensity >= state.shakeIntensity || state.shakeMs <= 0) {
    state.shakeIntensity = intensity
    state.shakeDurationMs = durationMs
    state.shakeMs = durationMs
  }
}

/** Loop-side event consumer: sound and screen shake. Never touches game logic. */
export function applyJuice(state: GameState): void {
  const J = CONFIG.juice
  for (const event of state.juiceEvents) {
    switch (event.type) {
      case 'spawned':
        playRadioBlip()
        break
      case 'landed':
        playThunk()
        break
      case 'near_miss':
        playWhoosh()
        shake(state, J.nearMissShakeIntensity, J.nearMissShakeMs)
        break
      case 'diverted':
        playAlarm()
        shake(state, J.divertShakeIntensity, J.divertShakeMs)
        break
      case 'raged':
        playBuzz()
        shake(state, J.rageShakeIntensity, J.rageShakeMs)
        break
      case 'departed_ok':
        playTakeoff()
        break
      case 'boarding_ready':
        playChime()
        break
      case 'event_fired':
        playAlarm()
        shake(state, J.rageShakeIntensity, J.rageShakeMs)
        break
      case 'go_around':
        playWhoosh()
        shake(state, J.nearMissShakeIntensity, J.nearMissShakeMs)
        break
      case 'fuel_out':
        playAlarm()
        shake(state, J.divertShakeIntensity, J.divertShakeMs)
        break
    }
  }
  state.juiceEvents = []
}

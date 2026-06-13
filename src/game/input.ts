import { CONFIG } from '../config'
import { playBuzz } from './juice/audio'
import { applyRunwayPick, reroutePlane } from './systems/events'
import type { GameState } from './state'

const WARNING_MS = 2200

export function attachInput(canvas: HTMLCanvasElement, getState: () => GameState): () => void {
  function onPointerDown(e: PointerEvent): void {
    const state = getState()
    if (state.phase !== 'active' || state.paused) return

    const rect = canvas.getBoundingClientRect()
    const lx = ((e.clientX - rect.left) / rect.width) * CONFIG.canvas.width
    const ly = ((e.clientY - rect.top) / rect.height) * CONFIG.canvas.height

    // 0. fog "close one runway": the next runway click shuts that strip
    if (state.runwayPick) {
      for (const runway of state.runways) {
        if (runway.containsPoint(lx, ly)) {
          applyRunwayPick(state, runway)
          return
        }
      }
      return // ignore non-runway clicks until a runway is chosen
    }

    // 1. plane tap — nearest selectable plane within hit radius
    let nearest = null
    let nearestDist: number = CONFIG.plane.hitRadiusPixels
    for (const plane of state.planes) {
      if (!plane.isSelectable) continue
      const d = Math.hypot(plane.x - lx, plane.y - ly)
      if (d < nearestDist) {
        nearest = plane
        nearestDist = d
      }
    }
    if (nearest) {
      // re-clicking an already-selected airborne plane re-routes it to another airport
      if (nearest.id === state.selectedPlaneId && nearest.isAirborneControllable) {
        reroutePlane(state, nearest)
        state.selectedPlaneId = null
        return
      }
      state.selectedPlaneId = nearest.id
      return
    }

    const selected = state.planes.find((p) => p.id === state.selectedPlaneId)

    // 2. runway tap — arrival queue (airborne) or departure queue (boarding)
    if (selected?.isAirborneControllable || selected?.state === 'boarding') {
      for (const runway of state.runways) {
        if (runway.containsPoint(lx, ly)) {
          if (!runway.canAccept(selected)) {
            state.warning = { text: `${selected.callsign} needs a LARGE runway`, msLeft: WARNING_MS }
            playBuzz()
            return // keep the selection so the player can pick a valid strip
          }
          runway.enqueue(selected)
          state.selectedPlaneId = null
          return
        }
      }
    }

    // 3. gate tap — reserve for any plane that hasn't reached a gate yet
    if (
      selected &&
      (selected.isAirborneControllable || (selected.state === 'rolling' && selected.rolloutDone))
    ) {
      for (const gate of state.gates) {
        if (gate.containsPoint(lx, ly) && gate.free) {
          if (!gate.canAccept(selected)) {
            state.warning = { text: `${selected.callsign} needs a LARGE gate`, msLeft: WARNING_MS }
            playBuzz()
            return
          }
          gate.reserve(selected)
          state.selectedPlaneId = null
          return
        }
      }
    }

    // 4. empty space — deselect
    state.selectedPlaneId = null
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  return () => canvas.removeEventListener('pointerdown', onPointerDown)
}

import { CONFIG } from '../config'
import type { GameState } from './state'

export function attachInput(canvas: HTMLCanvasElement, getState: () => GameState): () => void {
  function onPointerDown(e: PointerEvent): void {
    const state = getState()
    if (state.phase !== 'active') return

    const rect = canvas.getBoundingClientRect()
    const lx = ((e.clientX - rect.left) / rect.width) * CONFIG.canvas.width
    const ly = ((e.clientY - rect.top) / rect.height) * CONFIG.canvas.height

    // 1. plane tap — nearest selectable plane within hit radius
    let nearest = null
    let nearestDist = CONFIG.plane.hitRadiusPixels
    for (const plane of state.planes) {
      if (!plane.isSelectable) continue
      const d = Math.hypot(plane.x - lx, plane.y - ly)
      if (d < nearestDist) {
        nearest = plane
        nearestDist = d
      }
    }
    if (nearest) {
      state.selectedPlaneId = nearest.id
      return
    }

    const selected = state.planes.find((p) => p.id === state.selectedPlaneId)

    // 2. runway tap — arrival queue (airborne) or departure queue (boarding)
    if (selected?.isAirborneControllable || selected?.state === 'boarding') {
      for (const runway of state.runways) {
        if (runway.containsPoint(lx, ly)) {
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

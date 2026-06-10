import { CONFIG } from '../config'
import type { GameState } from './state'

export function attachInput(canvas: HTMLCanvasElement, getState: () => GameState): () => void {
  function onPointerDown(e: PointerEvent): void {
    const state = getState()
    if (state.phase !== 'active') return

    const rect = canvas.getBoundingClientRect()
    const lx = ((e.clientX - rect.left) / rect.width) * CONFIG.canvas.width
    const ly = ((e.clientY - rect.top) / rect.height) * CONFIG.canvas.height

    // 1. plane tap — nearest controllable plane within hit radius
    let nearest = null
    let nearestDist = CONFIG.plane.hitRadiusPixels
    for (const plane of state.planes) {
      if (!plane.isAirborneControllable) continue
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

    // 2. runway tap with a plane selected — assign
    if (state.selectedPlaneId !== null) {
      const selected = state.planes.find((p) => p.id === state.selectedPlaneId)
      if (selected?.isAirborneControllable) {
        for (const runway of state.runways) {
          if (runway.containsPoint(lx, ly)) {
            runway.enqueue(selected)
            state.selectedPlaneId = null
            return
          }
        }
      }
    }

    // 3. empty space — deselect
    state.selectedPlaneId = null
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  return () => canvas.removeEventListener('pointerdown', onPointerDown)
}

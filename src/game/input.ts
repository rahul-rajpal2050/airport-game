import { CONFIG } from '../config'
import { playBuzz } from './juice/audio'
import { getHeight, project, unprojectGround } from './iso'
import { applyRunwayPick, canReroute, reroutePlane } from './systems/events'
import { gameStore, type GameState } from './state'

const WARNING_MS = 2200

// the active state, captured by attachInput so the divert-dialog helpers can reach it
let liveState: (() => GameState) | null = null

/** DivertDialog "DIVERT" button */
export function confirmDivert(): void {
  const state = liveState?.()
  if (!state || state.divertPlaneId === null) return
  const plane = state.planes.find((p) => p.id === state.divertPlaneId)
  if (plane) reroutePlane(state, plane)
  state.divertPlaneId = null
  state.selectedPlaneId = null
  gameStore.notify()
}

/** DivertDialog "KEEP CIRCLING" button */
export function closeDivertPrompt(): void {
  const state = liveState?.()
  if (!state) return
  state.divertPlaneId = null
  gameStore.notify()
}

export function attachInput(canvas: HTMLCanvasElement, getState: () => GameState): () => void {
  liveState = getState

  // Plane hit-testing happens in SCREEN space (planes have projected height,
  // unlike the ground plane, so comparing against their projected position is
  // the correct check under the iso projection — see iso.ts).
  function nearestSelectable(lx: number, ly: number, getStateFn: () => GameState) {
    const state = getStateFn()
    let nearest = null
    let nearestDist: number = CONFIG.plane.hitRadiusPixels
    for (const plane of state.planes) {
      if (!plane.isSelectable) continue
      const p = project(plane.x, plane.y, getHeight(plane))
      const d = Math.hypot(p.x - lx, p.y - ly)
      if (d < nearestDist) {
        nearest = plane
        nearestDist = d
      }
    }
    return nearest
  }

  function toLogical(e: { clientX: number; clientY: number }): [number, number] {
    const rect = canvas.getBoundingClientRect()
    return [
      ((e.clientX - rect.left) / rect.width) * CONFIG.canvas.width,
      ((e.clientY - rect.top) / rect.height) * CONFIG.canvas.height,
    ]
  }

  // Runways/gates sit on the ground plane (height 0), so a click on them can be
  // unprojected back to world space and checked with the entities' existing
  // world-space containsPoint() — unchanged from before the iso pass.
  function toWorldGround(lx: number, ly: number): { x: number; y: number } {
    return unprojectGround(lx, ly)
  }

  // double-click a circling plane -> confirmation dialog to divert it
  function onDoubleClick(e: MouseEvent): void {
    const state = getState()
    if (state.phase !== 'active' || state.paused || state.runwayPick || state.pendingEvent) return
    const [lx, ly] = toLogical(e)
    const plane = nearestSelectable(lx, ly, getState)
    if (!plane || !plane.isAirborneControllable) return
    if (canReroute(plane)) {
      state.selectedPlaneId = plane.id
      state.divertPlaneId = plane.id
      gameStore.notify()
    } else {
      state.warning = { text: `${plane.callsign} fuel too low to divert`, msLeft: WARNING_MS }
      playBuzz()
    }
  }

  function onPointerDown(e: PointerEvent): void {
    const state = getState()
    if (state.phase !== 'active' || state.paused) return

    const [lx, ly] = toLogical(e)
    const ground = toWorldGround(lx, ly)

    // 0. fog "close one runway": the next runway click shuts that strip
    if (state.runwayPick) {
      for (const runway of state.runways) {
        if (runway.containsPoint(ground.x, ground.y)) {
          applyRunwayPick(state, runway)
          return
        }
      }
      return // ignore non-runway clicks until a runway is chosen
    }

    // 1. plane tap — select the nearest plane (double-click diverts; see onDoubleClick)
    const nearest = nearestSelectable(lx, ly, getState)
    if (nearest) {
      state.selectedPlaneId = nearest.id
      return
    }

    const selected = state.planes.find((p) => p.id === state.selectedPlaneId)

    // 2. runway tap — arrival queue (airborne) or departure queue (boarding)
    if (selected?.isAirborneControllable || selected?.state === 'boarding') {
      for (const runway of state.runways) {
        if (runway.containsPoint(ground.x, ground.y)) {
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
        if (gate.containsPoint(ground.x, ground.y) && gate.free) {
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
  canvas.addEventListener('dblclick', onDoubleClick)
  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('dblclick', onDoubleClick)
    liveState = null
  }
}

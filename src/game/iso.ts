import { CONFIG } from '../config'
import type { Plane, PlaneState } from './entities/plane'

/**
 * Tilted orthographic projection — X passes through unchanged, Y is squashed
 * and height lifts things up the screen. Deliberately NOT a diagonal-shear
 * "diamond" isometric: this world layout is mirror-symmetric about a vertical
 * world axis (the V-terminal, the runway row), and a shear formula only
 * preserves that symmetry if the whole map is laid out around the shear's
 * diagonals. Pure per-axis scaling preserves every existing symmetry exactly.
 * World space stays the flat top-down x/y the sim, entities, and all tests
 * already use — this module is the ONLY place that projects it onto screen.
 */
export interface ScreenPoint {
  x: number
  y: number
}

export function project(wx: number, wy: number, heightPx = 0): ScreenPoint {
  const I = CONFIG.iso
  return {
    x: wx * I.scaleX + I.originX,
    y: wy * I.scaleY - heightPx + I.originY,
  }
}

/** Inverse of project() for the ground plane (heightPx = 0) */
export function unprojectGround(sx: number, sy: number): { x: number; y: number } {
  const I = CONFIG.iso
  return { x: (sx - I.originX) / I.scaleX, y: (sy - I.originY) / I.scaleY }
}

/** A world circle of radius r projects to an axis-aligned screen ellipse */
export function projectCircleRadii(r: number): { rx: number; ry: number } {
  const I = CONFIG.iso
  return { rx: r * I.scaleX, ry: r * I.scaleY }
}

const AIRBORNE_STATES: ReadonlySet<PlaneState> = new Set(['approaching', 'holding', 'landing'])

/** Ground vs airborne target height for a plane, purely from its current state */
export function targetHeightFor(plane: Plane): number {
  if (AIRBORNE_STATES.has(plane.state)) return CONFIG.iso.planeMaxHeightPx
  if (plane.state === 'departing' && plane.wheelsUp) return CONFIG.iso.planeMaxHeightPx
  return 0
}

// Cosmetic-only smoothing caches: purely a render concern, never read by the sim.
const heightCache = new WeakMap<Plane, number>()
const headingCache = new WeakMap<Plane, number>()

/** Advances the plane's smoothed draw height one frame toward its target; call once per plane per rendered frame */
export function updateHeight(plane: Plane): number {
  const target = targetHeightFor(plane)
  const current = heightCache.get(plane) ?? 0 // first-ever draw: ease up from the ground
  const next = current + (target - current) * 0.15
  heightCache.set(plane, next)
  return next
}

/** Reads the last-computed smoothed height without advancing it (for click hit-testing) */
export function getHeight(plane: Plane): number {
  return heightCache.get(plane) ?? 0
}

function angleDelta(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/** Cheap bank fake: squish factor in [0,1] derived from this frame's heading change */
export function updateBank(plane: Plane): number {
  const last = headingCache.get(plane) ?? plane.heading
  const delta = angleDelta(plane.heading, last)
  headingCache.set(plane, plane.heading)
  return Math.max(-1, Math.min(1, delta * 6))
}

/** Rotates+projects a set of world-space corners (height 0) into screen points */
export function projectCorners(corners: { x: number; y: number }[]): ScreenPoint[] {
  return corners.map((c) => project(c.x, c.y, 0))
}

/** The quad edge (pair of adjacent projected corners) with the largest average screen Y — the "front" face for extrusion */
export function frontEdge(screenCorners: ScreenPoint[]): [ScreenPoint, ScreenPoint] {
  let best: [ScreenPoint, ScreenPoint] = [screenCorners[0], screenCorners[1]]
  let bestY = -Infinity
  for (let i = 0; i < screenCorners.length; i++) {
    const a = screenCorners[i]
    const b = screenCorners[(i + 1) % screenCorners.length]
    const avgY = (a.y + b.y) / 2
    if (avgY > bestY) {
      bestY = avgY
      best = [a, b]
    }
  }
  return best
}

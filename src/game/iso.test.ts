import { describe, expect, it } from 'bun:test'
import { CONFIG } from '../config'
import { Plane } from './entities/plane'
import {
  frontEdge,
  getHeight,
  project,
  projectCircleRadii,
  projectCorners,
  targetHeightFor,
  unprojectGround,
  updateBank,
  updateHeight,
} from './iso'

describe('project / unprojectGround', () => {
  it('round-trips ground points (height 0)', () => {
    for (const [wx, wy] of [[0, 0], [480, 300], [190, 0], [770, 600], [-50, 900]]) {
      const s = project(wx, wy, 0)
      const back = unprojectGround(s.x, s.y)
      expect(back.x).toBeCloseTo(wx, 5)
      expect(back.y).toBeCloseTo(wy, 5)
    }
  })

  it('height only shifts screen Y upward, never touches X', () => {
    const ground = project(400, 400, 0)
    const raised = project(400, 400, 40)
    expect(raised.x).toBeCloseTo(ground.x, 8)
    expect(raised.y).toBeCloseTo(ground.y - 40, 8)
  })
})

describe('projectCircleRadii', () => {
  it('produces positive radii proportional to the world radius', () => {
    const a = projectCircleRadii(50)
    const b = projectCircleRadii(100)
    expect(a.rx).toBeGreaterThan(0)
    expect(a.ry).toBeGreaterThan(0)
    expect(b.rx).toBeCloseTo(a.rx * 2, 5)
    expect(b.ry).toBeCloseTo(a.ry * 2, 5)
  })
})

describe('frontEdge', () => {
  it('picks the adjacent corner pair with the largest average screen Y', () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 10, y: 20 }, // this + next corner should win (avg Y = 15)
      { x: 0, y: 10 },
    ]
    const [a, b] = frontEdge(corners)
    expect([a, b]).toEqual([corners[2], corners[3]])
  })
})

describe('height and bank smoothing', () => {
  function makePlane(state: Plane['state']): Plane {
    const p = new Plane(1, 'TS100', 0, 0, 80, 0)
    if (state !== 'approaching') {
      // walk through legal transitions minimally for the states we need
      if (state === 'holding') {
        p.transition('holding')
      }
    }
    return p
  }

  it('approaching/holding target max height; ground states target 0', () => {
    expect(targetHeightFor(makePlane('approaching'))).toBe(CONFIG.iso.planeMaxHeightPx)
    expect(targetHeightFor(makePlane('holding'))).toBe(CONFIG.iso.planeMaxHeightPx)
  })

  it('updateHeight eases toward the target and getHeight reads the cached value', () => {
    const plane = makePlane('approaching') // airborne target
    expect(getHeight(plane)).toBe(0) // never rendered yet
    const h1 = updateHeight(plane)
    expect(h1).toBeGreaterThan(0)
    expect(h1).toBeLessThan(CONFIG.iso.planeMaxHeightPx)
    expect(getHeight(plane)).toBe(h1) // cached read matches
    let last = h1
    for (let i = 0; i < 50; i++) last = updateHeight(plane)
    expect(last).toBeCloseTo(CONFIG.iso.planeMaxHeightPx, 1) // converges
  })

  it('updateBank returns 0 for an unchanging heading and reacts to turns', () => {
    const plane = makePlane('approaching')
    expect(updateBank(plane)).toBeCloseTo(0, 5) // first call: no prior heading recorded yet
    expect(updateBank(plane)).toBeCloseTo(0, 5) // heading unchanged since
    plane.heading += 0.5
    expect(Math.abs(updateBank(plane))).toBeGreaterThan(0)
  })
})

describe('projectCorners', () => {
  it('projects each corner independently, preserving order', () => {
    const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    const projected = projectCorners(corners)
    expect(projected).toHaveLength(4)
    expect(projected[0]).toEqual(project(0, 0, 0))
    expect(projected[2]).toEqual(project(100, 100, 0))
  })
})

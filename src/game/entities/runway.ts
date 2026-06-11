import { CONFIG, type PlaneSize } from '../../config'
import type { Plane } from './plane'

const DEG = Math.PI / 180

export class Runway {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly angle: number // degrees
  readonly size: PlaneSize
  queue: Plane[] = []
  current: Plane | null = null
  closedUntil = 0 // shiftTime; sequence() won't commit while closed

  constructor(id: number, x: number, y: number, angle: number, size: PlaneSize = 'large') {
    this.id = id
    this.x = x
    this.y = y
    this.angle = angle
    this.size = size
  }

  get free(): boolean {
    return this.current === null
  }

  get width(): number {
    return CONFIG.runway.widths[this.size]
  }

  /** Small planes go anywhere; large planes need a large strip */
  canAccept(plane: Plane): boolean {
    return this.size === 'large' || plane.size === 'small'
  }

  /** Threshold (touchdown point) and far end, in logical coords */
  geometry(): { threshold: { x: number; y: number }; end: { x: number; y: number } } {
    const half = CONFIG.runway.lengthPixels / 2
    const dx = Math.cos(this.angle * DEG)
    const dy = Math.sin(this.angle * DEG)
    return {
      threshold: { x: this.x - dx * half, y: this.y - dy * half },
      end: { x: this.x + dx * half, y: this.y + dy * half },
    }
  }

  /** Where a departure waits for clearance: beside the threshold */
  holdShortPoint(): { x: number; y: number } {
    const { threshold } = this.geometry()
    const off = this.width / 2 + CONFIG.runway.holdShortOffsetPixels
    const perpX = -Math.sin(this.angle * DEG)
    const perpY = Math.cos(this.angle * DEG)
    return { x: threshold.x + perpX * off, y: threshold.y + perpY * off }
  }

  /** Mixed arrival/departure queue. A boarding plane starts taxiing out immediately. */
  enqueue(plane: Plane): void {
    if (!this.canAccept(plane)) return // size rules are enforced here, warned in input
    if (this.queue.includes(plane)) return
    plane.assignedRunway?.removeFromQueue(plane)
    plane.assignedRunway = this
    this.queue.push(plane)
    if (plane.state === 'boarding') plane.transition('taxiing_out')
  }

  removeFromQueue(plane: Plane): void {
    this.queue = this.queue.filter((p) => p !== plane)
    if (plane.assignedRunway === this) plane.assignedRunway = null
  }

  /** A committed landing aborts at the threshold: free the strip, back of the line */
  abortLanding(plane: Plane): void {
    if (this.current === plane) this.current = null
    this.queue.push(plane)
  }

  /** Called each frame by the sequencing step: clear finished plane, commit next */
  sequence(shiftTime = 0): void {
    if (this.current?.clearOfRunway) {
      this.current = null
    }
    this.queue = this.queue.filter((p) => p.state !== 'diverted')
    if (shiftTime < this.closedUntil) return // closed: no new commits
    while (this.current === null && this.queue.length > 0) {
      const head = this.queue[0]
      if (head.isAirborneControllable) {
        this.queue.shift()
        head.transition('landing')
        this.current = head
      } else if (head.state === 'taxiing_out' && head.atHoldShort) {
        this.queue.shift()
        head.transition('departing')
        this.current = head
      } else {
        // head is still taxiing to hold-short (or otherwise not ready) — strict FIFO waits
        break
      }
    }
  }

  containsPoint(px: number, py: number): boolean {
    const pad = CONFIG.runway.tapPaddingPixels
    const halfL = CONFIG.runway.lengthPixels / 2 + pad
    const halfW = this.width / 2 + pad
    const cos = Math.cos(-this.angle * DEG)
    const sin = Math.sin(-this.angle * DEG)
    const lx = (px - this.x) * cos - (py - this.y) * sin
    const ly = (px - this.x) * sin + (py - this.y) * cos
    return Math.abs(lx) <= halfL && Math.abs(ly) <= halfW
  }
}

import { CONFIG } from '../../config'
import type { Plane } from './plane'

const DEG = Math.PI / 180

export class Runway {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly angle: number // degrees
  queue: Plane[] = []
  current: Plane | null = null

  constructor(id: number, x: number, y: number, angle: number) {
    this.id = id
    this.x = x
    this.y = y
    this.angle = angle
  }

  get free(): boolean {
    return this.current === null
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
    const off = CONFIG.runway.widthPixels / 2 + CONFIG.runway.holdShortOffsetPixels
    const perpX = -Math.sin(this.angle * DEG)
    const perpY = Math.cos(this.angle * DEG)
    return { x: threshold.x + perpX * off, y: threshold.y + perpY * off }
  }

  /** Mixed arrival/departure queue. A boarding plane starts taxiing out immediately. */
  enqueue(plane: Plane): void {
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

  /** Called each frame by the sequencing step: clear finished plane, commit next */
  sequence(): void {
    if (this.current?.clearOfRunway) {
      this.current = null
    }
    this.queue = this.queue.filter((p) => p.state !== 'diverted')
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
    const halfW = CONFIG.runway.widthPixels / 2 + pad
    const cos = Math.cos(-this.angle * DEG)
    const sin = Math.sin(-this.angle * DEG)
    const lx = (px - this.x) * cos - (py - this.y) * sin
    const ly = (px - this.x) * sin + (py - this.y) * cos
    return Math.abs(lx) <= halfL && Math.abs(ly) <= halfW
  }
}

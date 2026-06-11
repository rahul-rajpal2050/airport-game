import { CONFIG, type PlaneSize } from '../../config'
import type { Plane } from './plane'

const DEG = Math.PI / 180

export class Gate {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly size: PlaneSize
  reservedBy: Plane | null = null

  constructor(id: number) {
    this.id = id
    // V-terminal: even ids climb the left arm, odd ids the right
    const G = CONFIG.gate
    const arm = id % 2 === 0 ? -1 : 1
    const step = Math.floor(id / 2)
    const a = G.armAngleDeg * DEG
    const dist = G.armStartOffset + step * G.spacingPixels
    this.x = G.apexX + arm * Math.cos(a) * dist
    this.y = G.apexY - Math.sin(a) * dist
    this.size = id % G.largeEvery === 0 ? 'large' : 'small'
  }

  get free(): boolean {
    return this.reservedBy === null
  }

  get boxSize(): number {
    return this.size === 'large' ? CONFIG.gate.largeSizePixels : CONFIG.gate.sizePixels
  }

  /** Small planes park anywhere; large planes need a large gate */
  canAccept(plane: Plane): boolean {
    return this.size === 'large' || plane.size === 'small'
  }

  /** Occupied = plane physically at the gate (vs merely reserved by an inbound) */
  get occupied(): boolean {
    const s = this.reservedBy?.state
    return s === 'at_gate' || s === 'boarding'
  }

  reserve(plane: Plane): void {
    if (!this.canAccept(plane)) return // size rules enforced here, warned in input
    if (plane.assignedGate === this) return
    if (this.reservedBy && this.reservedBy !== plane) this.release()
    plane.assignedGate?.release()
    this.reservedBy = plane
    plane.assignedGate = this
  }

  release(): void {
    if (this.reservedBy) this.reservedBy.assignedGate = null
    this.reservedBy = null
  }

  containsPoint(px: number, py: number): boolean {
    const half = this.boxSize / 2 + CONFIG.gate.tapPaddingPixels
    return Math.abs(px - this.x) <= half && Math.abs(py - this.y) <= half
  }
}

import { CONFIG } from '../../config'
import type { Plane } from './plane'

export class Gate {
  readonly id: number
  readonly x: number
  readonly y: number
  reservedBy: Plane | null = null

  constructor(id: number) {
    this.id = id
    this.x = CONFIG.gate.firstGateX + id * CONFIG.gate.spacingPixels
    this.y = CONFIG.gate.terminalY
  }

  get free(): boolean {
    return this.reservedBy === null
  }

  /** Occupied = plane physically at the gate (vs merely reserved by an inbound) */
  get occupied(): boolean {
    const s = this.reservedBy?.state
    return s === 'at_gate' || s === 'boarding'
  }

  reserve(plane: Plane): void {
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
    const half = CONFIG.gate.sizePixels / 2 + CONFIG.gate.tapPaddingPixels
    return Math.abs(px - this.x) <= half && Math.abs(py - this.y) <= half
  }
}

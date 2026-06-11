import { CONFIG } from '../../config'
import type { Plane } from './plane'

const DEG = Math.PI / 180

export class Gate {
  readonly id: number
  readonly x: number
  readonly y: number
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

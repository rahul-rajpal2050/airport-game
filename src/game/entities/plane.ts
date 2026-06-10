import { CONFIG } from '../../config'
import type { Runway } from './runway'

// Full lifecycle defined now; Phase 1 implements approaching → holding →
// landing → rolling → departed, plus the diverted failure branch.
// Phase 2 adds the gate path (taxiing → at_gate → boarding → taxiing_out → departing).
export type PlaneState =
  | 'approaching'
  | 'holding'
  | 'landing'
  | 'rolling'
  | 'taxiing'
  | 'at_gate'
  | 'boarding'
  | 'taxiing_out'
  | 'departing'
  | 'departed'
  | 'diverted'

const ALLOWED: Partial<Record<PlaneState, PlaneState[]>> = {
  approaching: ['holding', 'landing', 'diverted'],
  holding: ['landing', 'diverted'],
  landing: ['rolling'],
  rolling: ['departed'],
}

export interface FrameEvent {
  type: 'spawned' | 'landed' | 'diverted'
  plane: Plane
}

export interface UpdateContext {
  events: FrameEvent[]
  shiftTime: number
  /** ring indices currently occupied by holding planes, for slot assignment */
  occupiedRings: Set<number>
}

const DEG = Math.PI / 180

export class Plane {
  readonly id: number
  readonly callsign: string
  x: number
  y: number
  heading = 0 // radians
  state: PlaneState = 'approaching'
  fuel: number
  patience: number = CONFIG.plane.initialPatience
  holdSeconds = 0
  ringIndex = -1
  orbitAngle = 0
  assignedRunway: Runway | null = null
  private rollElapsed = 0
  private rollFrom = { x: 0, y: 0 }
  private rollTo = { x: 0, y: 0 }

  constructor(id: number, callsign: string, x: number, y: number, fuel: number) {
    this.id = id
    this.callsign = callsign
    this.x = x
    this.y = y
    this.fuel = fuel
    const { holdingCenterX, holdingCenterY } = CONFIG.approach
    this.heading = Math.atan2(holdingCenterY - y, holdingCenterX - x)
  }

  transition(to: PlaneState): void {
    const allowed = ALLOWED[this.state]
    if (!allowed || !allowed.includes(to)) {
      throw new Error(`Illegal transition ${this.state} -> ${to} (${this.callsign})`)
    }
    if (this.state === 'holding') this.ringIndex = -1
    this.state = to
    if (to === 'landing' && this.assignedRunway) {
      const { threshold, end } = this.assignedRunway.geometry()
      this.rollFrom = threshold
      this.rollTo = end
      this.rollElapsed = 0
    }
  }

  get isAirborneControllable(): boolean {
    return this.state === 'approaching' || this.state === 'holding'
  }

  update(dt: number, ctx: UpdateContext): void {
    switch (this.state) {
      case 'approaching':
        this.updateApproaching(dt, ctx)
        break
      case 'holding':
        this.updateHolding(dt, ctx)
        break
      case 'landing':
        this.updateLanding(dt)
        break
      case 'rolling':
        this.updateRolling(dt, ctx)
        break
    }
  }

  private drainFuel(dt: number, ctx: UpdateContext): boolean {
    this.fuel -= CONFIG.plane.fuelDrainPerSecond * dt
    if (this.fuel <= 0) {
      this.fuel = 0
      this.transition('diverted')
      ctx.events.push({ type: 'diverted', plane: this })
      return true
    }
    return false
  }

  private updateApproaching(dt: number, ctx: UpdateContext): void {
    if (this.drainFuel(dt, ctx)) return
    const { holdingCenterX: cx, holdingCenterY: cy } = CONFIG.approach
    const dx = cx - this.x
    const dy = cy - this.y
    const dist = Math.hypot(dx, dy)
    this.heading = Math.atan2(dy, dx)
    const step = CONFIG.plane.speedPixelsPerSecond * dt

    // enter the innermost free holding ring when we reach its radius
    let ring = 0
    while (ctx.occupiedRings.has(ring)) ring++
    const ringRadius = CONFIG.approach.holdingRadiusBase + ring * CONFIG.approach.holdingRadiusStep

    if (dist - step <= ringRadius) {
      this.ringIndex = ring
      ctx.occupiedRings.add(ring)
      this.orbitAngle = Math.atan2(this.y - cy, this.x - cx)
      this.transition('holding')
      return
    }
    this.x += (dx / dist) * step
    this.y += (dy / dist) * step
  }

  private updateHolding(dt: number, ctx: UpdateContext): void {
    if (this.drainFuel(dt, ctx)) return
    this.patience = Math.max(0, this.patience - CONFIG.plane.patienceDrainPerSecond * dt)
    this.holdSeconds += dt
    const { holdingCenterX: cx, holdingCenterY: cy, holdingRadiusBase, holdingRadiusStep, orbitSpeedDegreesPerSecond } = CONFIG.approach
    const radius = holdingRadiusBase + this.ringIndex * holdingRadiusStep
    this.orbitAngle += orbitSpeedDegreesPerSecond * DEG * dt
    this.x = cx + radius * Math.cos(this.orbitAngle)
    this.y = cy + radius * Math.sin(this.orbitAngle)
    this.heading = this.orbitAngle + Math.PI / 2
  }

  private updateLanding(dt: number): void {
    const dx = this.rollFrom.x - this.x
    const dy = this.rollFrom.y - this.y
    const dist = Math.hypot(dx, dy)
    const step = CONFIG.plane.landingSpeedPixelsPerSecond * dt
    if (dist <= step) {
      this.x = this.rollFrom.x
      this.y = this.rollFrom.y
      this.heading = Math.atan2(this.rollTo.y - this.rollFrom.y, this.rollTo.x - this.rollFrom.x)
      this.transition('rolling')
      return
    }
    this.heading = Math.atan2(dy, dx)
    this.x += (dx / dist) * step
    this.y += (dy / dist) * step
  }

  private updateRolling(dt: number, ctx: UpdateContext): void {
    this.rollElapsed += dt
    const t = Math.min(this.rollElapsed / CONFIG.runway.occupancySeconds, 1)
    const ease = 1 - (1 - t) * (1 - t) // ease-out: fast touchdown, slow rollout
    this.x = this.rollFrom.x + (this.rollTo.x - this.rollFrom.x) * ease
    this.y = this.rollFrom.y + (this.rollTo.y - this.rollFrom.y) * ease
    if (t >= 1) {
      this.transition('departed')
      ctx.events.push({ type: 'landed', plane: this })
    }
  }
}

import { CONFIG, type PlaneSize } from '../../config'
import type { Gate } from './gate'
import type { Runway } from './runway'

export type { PlaneSize }

export type PlaneState =
  | 'approaching'
  | 'holding'
  | 'landing'
  | 'rolling'      // on runway after touchdown; BLOCKS it until a gate is assigned
  | 'taxiing'      // runway -> gate
  | 'at_gate'      // turnaround in progress (patience paused)
  | 'boarding'     // turnaround done, waiting for departure runway (patience drains)
  | 'taxiing_out'  // gate -> hold-short point (gate freed on exit)
  | 'departing'    // takeoff roll + climb-out
  | 'departed'
  | 'diverted'

export type PlaneKind = 'normal' | 'medical' | 'vip'

const ALLOWED: Partial<Record<PlaneState, PlaneState[]>> = {
  approaching: ['holding', 'landing', 'diverted'],
  holding: ['landing', 'diverted'],
  landing: ['rolling', 'approaching'], // approaching = go-around
  rolling: ['taxiing'],
  taxiing: ['at_gate'],
  at_gate: ['boarding'],
  boarding: ['taxiing_out'],
  taxiing_out: ['departing'],
  departing: ['departed'],
}

export type FrameEvent =
  | { type: 'spawned' | 'landed' | 'diverted' | 'raged' | 'boarding_ready' | 'go_around' | 'fuel_out'; plane: Plane }
  | { type: 'departed_ok'; plane: Plane; delaySeconds: number }
  | { type: 'near_miss'; a: Plane; b: Plane }
  | { type: 'event_fired'; defId: string }

export interface UpdateContext {
  events: FrameEvent[]
  shiftTime: number
  /** ring indices currently occupied by holding planes, for slot assignment */
  occupiedRings: Set<number>
  /** combined event x perk multipliers (1 when nothing is active) */
  patienceMult: number
  fuelMult: number
  turnaroundMult: number
  /** true = this landing must go around (risk roll already consumed) */
  goAround: (runwayId: number) => boolean
  /** rollout duration multiplier for a plane entering the runway (bird strike) */
  consumeRolloutMult: () => number
}

export function neutralContext(shiftTime = 0): UpdateContext {
  return {
    events: [],
    shiftTime,
    occupiedRings: new Set(),
    patienceMult: 1,
    fuelMult: 1,
    turnaroundMult: 1,
    goAround: () => false,
    consumeRolloutMult: () => 1,
  }
}

const DEG = Math.PI / 180
const OFFSCREEN_MARGIN = 40

export class Plane {
  readonly id: number
  readonly callsign: string
  readonly size: PlaneSize
  readonly spawnTime: number
  x: number
  y: number
  heading = 0 // radians
  state: PlaneState = 'approaching'
  kind: PlaneKind = 'normal'
  kindDeadline: number | null = null // medical: must be on the ground by this shiftTime
  rolloutMult = 1
  fuel: number
  patience: number = CONFIG.plane.initialPatience
  raged = false
  holdSeconds = 0
  ringIndex = -1
  orbitAngle = 0
  assignedRunway: Runway | null = null
  assignedGate: Gate | null = null
  rolloutDone = false
  atHoldShort = false
  wheelsUp = false
  /** set when turnaround completes; departure window counts from here */
  boardingStart: number | null = null
  /** seconds past the departure window, frozen once the plane leaves the gate */
  gateDelaySeconds = 0
  private rollElapsed = 0
  private rollFrom = { x: 0, y: 0 }
  private rollTo = { x: 0, y: 0 }
  private taxiTarget = { x: 0, y: 0 }
  private gateTimer = 0

  constructor(
    id: number,
    callsign: string,
    x: number,
    y: number,
    fuel: number,
    spawnTime: number,
    size: PlaneSize = 'small'
  ) {
    this.id = id
    this.callsign = callsign
    this.x = x
    this.y = y
    this.fuel = fuel
    this.spawnTime = spawnTime
    this.size = size
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
    } else if (to === 'taxiing' && this.assignedGate) {
      this.taxiTarget = { x: this.assignedGate.x, y: this.assignedGate.y }
      this.assignedRunway = null // arrival complete; departure needs a fresh assignment
    } else if (to === 'at_gate') {
      this.gateTimer = 0
      // nose toward the V apex — parked planes read as docked at the terminal
      this.heading = Math.atan2(CONFIG.gate.apexY - this.y, CONFIG.gate.apexX - this.x)
    } else if (to === 'taxiing_out' && this.assignedRunway) {
      this.taxiTarget = this.assignedRunway.holdShortPoint()
      this.atHoldShort = false
      this.assignedGate?.release() // gate frees the moment the plane pushes back
    } else if (to === 'departing' && this.assignedRunway) {
      // departures roll opposite to arrivals: end -> threshold, away from the terminal
      const { threshold, end } = this.assignedRunway.geometry()
      this.rollFrom = end
      this.rollTo = threshold
      this.rollElapsed = 0
      this.x = end.x
      this.y = end.y
      this.heading = Math.atan2(threshold.y - end.y, threshold.x - end.x)
    }
  }

  /** Airborne and awaiting a landing slot — valid arrival-queue target */
  get isAirborneControllable(): boolean {
    return this.state === 'approaching' || this.state === 'holding'
  }

  /** Player can tap-select this plane */
  get isSelectable(): boolean {
    return (
      this.isAirborneControllable ||
      (this.state === 'rolling' && this.rolloutDone) ||
      this.state === 'boarding'
    )
  }

  /** Runway occupant no longer blocks the strip */
  get clearOfRunway(): boolean {
    if (this.state === 'landing' || this.state === 'rolling') return false
    if (this.state === 'departing') return this.wheelsUp
    return true
  }

  /** Patience is actively draining — passengers are waiting on the player */
  private get isWaiting(): boolean {
    return (
      this.state === 'holding' ||
      this.state === 'boarding' ||
      (this.state === 'rolling' && this.rolloutDone) ||
      (this.state === 'taxiing_out' && this.atHoldShort)
    )
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
        this.updateLanding(dt, ctx)
        break
      case 'rolling':
        this.updateRolling(dt, ctx)
        break
      case 'taxiing':
        this.updateTaxi(dt, () => this.transition('at_gate'))
        break
      case 'at_gate':
        this.gateTimer += dt
        if (this.gateTimer >= CONFIG.gate.turnaroundSeconds * ctx.turnaroundMult) {
          this.transition('boarding')
          this.boardingStart = ctx.shiftTime
          ctx.events.push({ type: 'boarding_ready', plane: this })
        }
        break
      case 'boarding':
        // departure window countdown; overdue seconds drive D:00 and the score drip
        if (this.boardingStart !== null) {
          this.gateDelaySeconds = Math.max(
            0,
            ctx.shiftTime - this.boardingStart - CONFIG.gate.departWindowSeconds
          )
        }
        break
      case 'taxiing_out':
        if (!this.atHoldShort) this.updateTaxi(dt, () => (this.atHoldShort = true))
        break
      case 'departing':
        this.updateDeparting(dt, ctx)
        break
    }
    this.drainPatience(dt, ctx)
  }

  private drainPatience(dt: number, ctx: UpdateContext): void {
    if (this.state === 'holding') this.holdSeconds += dt
    if (!this.isWaiting || this.raged) return
    const mult = ctx.patienceMult * (this.kind === 'vip' ? CONFIG.events.vip.patienceDrainMult : 1)
    this.patience = Math.max(0, this.patience - CONFIG.plane.patienceDrainPerSecond * mult * dt)
    if (this.patience === 0) {
      this.raged = true
      ctx.events.push({ type: 'raged', plane: this })
    }
  }

  /** Fuel is a circling budget: 100% lasts sizes[size].fuelSeconds of holding. Empty = game over. */
  private drainFuel(dt: number, ctx: UpdateContext): boolean {
    const mult = ctx.fuelMult * (this.kind === 'medical' ? CONFIG.events.medical.fuelDrainMult : 1)
    const ratePerSecond = CONFIG.plane.initialFuel / CONFIG.plane.sizes[this.size].fuelSeconds
    this.fuel -= ratePerSecond * mult * dt
    if (this.fuel <= 0) {
      this.fuel = 0
      ctx.events.push({ type: 'fuel_out', plane: this })
      return true
    }
    return false
  }

  private updateApproaching(dt: number, ctx: UpdateContext): void {
    // fuel only burns while circling — the approach itself is free
    const { holdingCenterX: cx, holdingCenterY: cy } = CONFIG.approach
    const dx = cx - this.x
    const dy = cy - this.y
    const dist = Math.hypot(dx, dy)
    this.heading = Math.atan2(dy, dx)
    const step = CONFIG.plane.speedPixelsPerSecond * dt

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
    const { holdingCenterX: cx, holdingCenterY: cy, holdingRadiusBase, holdingRadiusStep, orbitSpeedDegreesPerSecond } = CONFIG.approach
    const radius = holdingRadiusBase + this.ringIndex * holdingRadiusStep
    this.orbitAngle += orbitSpeedDegreesPerSecond * DEG * dt
    this.x = cx + radius * Math.cos(this.orbitAngle)
    this.y = cy + radius * Math.sin(this.orbitAngle)
    this.heading = this.orbitAngle + Math.PI / 2
  }

  private updateLanding(dt: number, ctx: UpdateContext): void {
    const dx = this.rollFrom.x - this.x
    const dy = this.rollFrom.y - this.y
    const dist = Math.hypot(dx, dy)
    const step = CONFIG.plane.landingSpeedPixelsPerSecond * dt
    if (dist <= step) {
      // at the threshold: low-visibility / debris risk can force a go-around
      if (this.assignedRunway && ctx.goAround(this.assignedRunway.id)) {
        this.assignedRunway.abortLanding(this)
        this.transition('approaching')
        this.heading = Math.atan2(
          CONFIG.approach.holdingCenterY - this.y,
          CONFIG.approach.holdingCenterX - this.x
        )
        ctx.events.push({ type: 'go_around', plane: this })
        return
      }
      this.x = this.rollFrom.x
      this.y = this.rollFrom.y
      this.heading = Math.atan2(this.rollTo.y - this.rollFrom.y, this.rollTo.x - this.rollFrom.x)
      this.rolloutMult = ctx.consumeRolloutMult()
      this.transition('rolling')
      return
    }
    this.heading = Math.atan2(dy, dx)
    this.x += (dx / dist) * step
    this.y += (dy / dist) * step
  }

  private updateRolling(dt: number, ctx: UpdateContext): void {
    if (!this.rolloutDone) {
      this.rollElapsed += dt
      const t = Math.min(this.rollElapsed / (CONFIG.runway.occupancySeconds * this.rolloutMult), 1)
      const ease = 1 - (1 - t) * (1 - t)
      this.x = this.rollFrom.x + (this.rollTo.x - this.rollFrom.x) * ease
      this.y = this.rollFrom.y + (this.rollTo.y - this.rollFrom.y) * ease
      if (t >= 1) {
        this.rolloutDone = true
        ctx.events.push({ type: 'landed', plane: this })
      }
      return
    }
    // rollout finished: leave for the gate if one is assigned, else BLOCK the runway
    if (this.assignedGate) this.transition('taxiing')
  }

  private updateTaxi(dt: number, onArrive: () => void): void {
    const dx = this.taxiTarget.x - this.x
    const dy = this.taxiTarget.y - this.y
    const dist = Math.hypot(dx, dy)
    const step = CONFIG.plane.taxiSpeedPixelsPerSecond * dt
    if (dist <= step) {
      this.x = this.taxiTarget.x
      this.y = this.taxiTarget.y
      onArrive()
      return
    }
    this.heading = Math.atan2(dy, dx)
    this.x += (dx / dist) * step
    this.y += (dy / dist) * step
  }

  private updateDeparting(dt: number, ctx: UpdateContext): void {
    if (!this.wheelsUp) {
      this.rollElapsed += dt
      const t = Math.min(this.rollElapsed / CONFIG.runway.takeoffSeconds, 1)
      const ease = t * t // ease-in: slow start, fast liftoff
      this.x = this.rollFrom.x + (this.rollTo.x - this.rollFrom.x) * ease
      this.y = this.rollFrom.y + (this.rollTo.y - this.rollFrom.y) * ease
      if (t >= 1) {
        this.wheelsUp = true
        // delay = how long it sat at the gate past the departure window
        ctx.events.push({ type: 'departed_ok', plane: this, delaySeconds: this.gateDelaySeconds })
      }
      return
    }
    // climb out: curve toward the top edge, despawn off-screen
    const targetHeading = -Math.PI / 2
    let diff = targetHeading - this.heading
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    this.heading += diff * Math.min(1, dt * 1.5)
    const speed = CONFIG.plane.climbOutSpeedPixelsPerSecond
    this.x += Math.cos(this.heading) * speed * dt
    this.y += Math.sin(this.heading) * speed * dt
    const { width, height } = CONFIG.canvas
    if (
      this.x < -OFFSCREEN_MARGIN || this.x > width + OFFSCREEN_MARGIN ||
      this.y < -OFFSCREEN_MARGIN || this.y > height + OFFSCREEN_MARGIN
    ) {
      this.transition('departed')
    }
  }
}

import { CONFIG } from '../config'
import type { Gate } from './entities/gate'
import type { Plane } from './entities/plane'
import type { Runway } from './entities/runway'
import type { GameState } from './state'
import { upcomingEvent } from './systems/events'

const DEG = Math.PI / 180

// Jet silhouette, nose toward +x. Drawn at a 36px length baseline, scaled from config.
// Built lazily: Path2D only exists in the browser, and headless tests import this module.
const PLANE_PATH_D =
  'M 18 0 L 12 -3 L 3 -3 L -5 -14 L -8 -14 L -3 -3 L -12 -2.5 L -17 -8 L -19 -8 L -16.5 -2 L -18 0 ' +
  'L -16.5 2 L -19 8 L -17 8 L -12 2.5 L -3 3 L -8 14 L -5 14 L 3 3 L 12 3 Z'
let planePath: Path2D | null = null
function getPlanePath(): Path2D {
  if (!planePath) planePath = new Path2D(PLANE_PATH_D)
  return planePath
}
const PLANE_BASELINE_WIDTH = 28

const COLORS = {
  bg: '#0a0e1a',
  bgGradientTop: '#0b101f',
  bgGradientBottom: '#16203a',
  apron: 'rgba(30, 41, 66, 0.45)',
  apronEdge: 'rgba(74, 85, 104, 0.35)',
  shadow: 'rgba(0, 0, 0, 0.35)',
  runway: '#2a3142',
  runwayStripe: '#4a5568',
  terminal: '#1a2030',
  gateFree: 'rgba(148, 163, 184, 0.4)',
  gateReserved: '#60a5fa',
  gateOccupied: '#334155',
  plane: '#e2e8f0',
  planeWarning: '#facc15',
  planeCritical: '#ef4444',
  selection: '#4ade80',
  assignLine: 'rgba(74, 222, 128, 0.35)',
  gateLine: 'rgba(96, 165, 250, 0.35)',
  holdRing: 'rgba(148, 163, 184, 0.12)',
  hud: '#94a3b8',
  hudBright: '#e2e8f0',
  streak: '#4ade80',
  vip: '#60a5fa',
  slowMoTint: 'rgba(96, 165, 250, 0.07)',
  fuelBar: '#facc15',
  patienceBar: '#fb923c',
  barBg: 'rgba(148, 163, 184, 0.25)',
} as const

let bgGradient: CanvasGradient | null = null
let vignette: CanvasGradient | null = null

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const { width, height } = CONFIG.canvas
  if (!bgGradient) {
    bgGradient = ctx.createLinearGradient(0, 0, 0, height)
    bgGradient.addColorStop(0, COLORS.bgGradientTop)
    bgGradient.addColorStop(1, COLORS.bgGradientBottom)
    vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, width * 0.75)
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.4)')
  }
  ctx.fillStyle = bgGradient
  ctx.fillRect(0, 0, width, height)

  // apron: the paved field around runways and terminal
  ctx.fillStyle = COLORS.apron
  ctx.strokeStyle = COLORS.apronEdge
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(220, 350, 520, 240, 18)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = vignette!
  ctx.fillRect(0, 0, width, height)
}

export function draw(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { width, height } = CONFIG.canvas
  drawBackground(ctx)

  if (state.phase === 'pre_shift') return // React menu covers the canvas

  // screen shake: deterministic high-frequency wobble, decaying with remaining time
  ctx.save()
  if (state.shakeMs > 0 && state.shakeDurationMs > 0) {
    const amp = state.shakeIntensity * (state.shakeMs / state.shakeDurationMs)
    ctx.translate(Math.sin(state.shiftTime * 53) * amp, Math.cos(state.shiftTime * 47) * amp)
  }

  drawHoldingRings(ctx, state)
  drawTerminal(ctx, state.gates)
  for (const runway of state.runways) drawRunway(ctx, runway, state.shiftTime)
  drawAssignmentLines(ctx, state)
  for (const plane of state.planes) drawPlane(ctx, plane, plane.id === state.selectedPlaneId, state.shiftTime)
  drawHud(ctx, state)
  ctx.restore()

  if (state.slowMoMs > 0) {
    ctx.fillStyle = COLORS.slowMoTint
    ctx.fillRect(0, 0, width, height)
  }
}

function drawTerminal(ctx: CanvasRenderingContext2D, gates: Gate[]): void {
  if (gates.length === 0) return
  const size = CONFIG.gate.sizePixels
  const pad = 14
  const left = gates[0].x - size / 2 - pad
  const right = gates[gates.length - 1].x + size / 2 + pad
  // terminal building strip behind the gate row
  ctx.fillStyle = COLORS.terminal
  ctx.fillRect(left, CONFIG.gate.terminalY + size / 2, right - left, 28)

  ctx.font = `${CONFIG.ui.hudFontSize - 2}px monospace`
  ctx.textAlign = 'center'
  for (const gate of gates) {
    if (gate.occupied) {
      ctx.fillStyle = COLORS.gateOccupied
      ctx.fillRect(gate.x - size / 2, gate.y - size / 2, size, size)
    } else if (!gate.free) {
      ctx.strokeStyle = COLORS.gateReserved
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.strokeRect(gate.x - size / 2, gate.y - size / 2, size, size)
      ctx.setLineDash([])
    } else {
      ctx.strokeStyle = COLORS.gateFree
      ctx.lineWidth = 1
      ctx.strokeRect(gate.x - size / 2, gate.y - size / 2, size, size)
    }
    ctx.fillStyle = COLORS.hud
    ctx.fillText(`G${gate.id + 1}`, gate.x, gate.y + size / 2 + 20)
  }
}

function drawHoldingRings(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { holdingCenterX, holdingCenterY, holdingRadiusBase, holdingRadiusStep } = CONFIG.approach
  let rings = 1
  for (const p of state.planes) {
    if (p.state === 'holding') rings = Math.max(rings, p.ringIndex + 1)
  }
  ctx.strokeStyle = COLORS.holdRing
  ctx.lineWidth = 1
  for (let i = 0; i < rings; i++) {
    ctx.beginPath()
    ctx.arc(holdingCenterX, holdingCenterY, holdingRadiusBase + i * holdingRadiusStep, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawRunway(ctx: CanvasRenderingContext2D, runway: Runway, shiftTime: number): void {
  const { lengthPixels, widthPixels } = CONFIG.runway
  const closed = shiftTime < runway.closedUntil
  ctx.save()
  ctx.translate(runway.x, runway.y)
  ctx.rotate(runway.angle * DEG)

  ctx.fillStyle = COLORS.runway
  ctx.fillRect(-lengthPixels / 2, -widthPixels / 2, lengthPixels, widthPixels)

  // centerline dashes
  ctx.strokeStyle = COLORS.runwayStripe
  ctx.lineWidth = 2
  ctx.setLineDash([8, 8])
  ctx.beginPath()
  ctx.moveTo(-lengthPixels / 2 + 6, 0)
  ctx.lineTo(lengthPixels / 2 - 6, 0)
  ctx.stroke()
  ctx.setLineDash([])

  // threshold stripe at touchdown end
  ctx.fillStyle = COLORS.runwayStripe
  ctx.fillRect(-lengthPixels / 2, -widthPixels / 2, 4, widthPixels)

  if (closed) {
    // diagonal hatching + label
    ctx.strokeStyle = COLORS.planeCritical
    ctx.lineWidth = 2
    for (let x = -lengthPixels / 2; x < lengthPixels / 2; x += 14) {
      ctx.beginPath()
      ctx.moveTo(x, -widthPixels / 2)
      ctx.lineTo(x + 8, widthPixels / 2)
      ctx.stroke()
    }
    ctx.fillStyle = COLORS.planeCritical
    ctx.font = `bold ${CONFIG.ui.hudFontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText('CLOSED', 0, -widthPixels / 2 - 6)
  } else if (!runway.free) {
    ctx.strokeStyle = COLORS.planeCritical
    ctx.lineWidth = 1.5
    ctx.strokeRect(-lengthPixels / 2 - 3, -widthPixels / 2 - 3, lengthPixels + 6, widthPixels + 6)
  }
  ctx.restore()

  // queue count
  if (runway.queue.length > 0) {
    ctx.fillStyle = COLORS.hudBright
    ctx.font = `bold ${CONFIG.ui.hudFontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(`+${runway.queue.length}`, runway.x, runway.y + widthPixels + 14)
  }
}

function drawAssignmentLines(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.lineWidth = 1
  for (const plane of state.planes) {
    if (plane.isAirborneControllable && plane.assignedRunway) {
      ctx.strokeStyle = COLORS.assignLine
      ctx.beginPath()
      ctx.moveTo(plane.x, plane.y)
      ctx.lineTo(plane.assignedRunway.x, plane.assignedRunway.y)
      ctx.stroke()
    }
    const showGateLine =
      plane.assignedGate &&
      (plane.isAirborneControllable || plane.state === 'landing' || plane.state === 'rolling')
    if (showGateLine) {
      ctx.strokeStyle = COLORS.gateLine
      ctx.beginPath()
      ctx.moveTo(plane.x, plane.y)
      ctx.lineTo(plane.assignedGate!.x, plane.assignedGate!.y)
      ctx.stroke()
    }
  }
}

function planeColor(plane: Plane, shiftTime: number): string {
  if (plane.kind === 'medical') {
    // urgent pulse between critical red and white
    return Math.sin(shiftTime * 10) > 0 ? COLORS.planeCritical : COLORS.plane
  }
  if (plane.kind === 'vip') return COLORS.vip
  if (plane.fuel <= CONFIG.ui.fuelWarningThreshold / 2) return COLORS.planeCritical
  if (plane.fuel <= CONFIG.ui.fuelWarningThreshold) return COLORS.planeWarning
  return COLORS.plane
}

function drawPlane(ctx: CanvasRenderingContext2D, plane: Plane, selected: boolean, shiftTime: number): void {
  if (plane.state === 'departed' || plane.state === 'diverted') return
  const { width: w, height: h } = CONFIG.plane
  const stuck = plane.state === 'rolling' && plane.rolloutDone && !plane.assignedGate

  ctx.save()
  ctx.translate(plane.x, plane.y)

  if (selected) {
    ctx.strokeStyle = COLORS.selection
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, CONFIG.plane.hitRadiusPixels * 0.8, 0, Math.PI * 2)
    ctx.stroke()
  } else if (stuck && Math.sin(shiftTime * 8) > 0) {
    // blocked-runway flash: the cascade must be legible
    ctx.strokeStyle = COLORS.planeCritical
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, CONFIG.plane.hitRadiusPixels * 0.8, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()

  const scale = CONFIG.plane.width / PLANE_BASELINE_WIDTH
  const airborne =
    plane.isAirborneControllable ||
    plane.state === 'landing' ||
    (plane.state === 'departing' && plane.wheelsUp)

  // drop shadow: offset grows with altitude — the cheap depth cue
  const shadowDx = airborne ? 5 : 2
  const shadowDy = airborne ? 8 : 3
  ctx.save()
  ctx.translate(plane.x + shadowDx, plane.y + shadowDy)
  ctx.rotate(plane.heading)
  ctx.scale(scale, scale)
  ctx.fillStyle = COLORS.shadow
  ctx.fill(getPlanePath())
  ctx.restore()

  ctx.save()
  ctx.translate(plane.x, plane.y)
  ctx.rotate(plane.heading)
  ctx.scale(scale, scale)
  ctx.fillStyle = planeColor(plane, shiftTime)
  ctx.fill(getPlanePath())
  ctx.restore()

  // callsign + fuel bar (airborne)
  if (plane.isAirborneControllable) {
    ctx.fillStyle = COLORS.hud
    ctx.font = `${CONFIG.ui.hudFontSize - 2}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(plane.callsign, plane.x, plane.y - h - 8)

    if (plane.fuel <= CONFIG.ui.fuelWarningThreshold) {
      drawBar(ctx, plane, plane.fuel,
        plane.fuel <= CONFIG.ui.fuelWarningThreshold / 2 ? COLORS.planeCritical : COLORS.fuelBar)
    }
    return
  }

  // patience bar on waiting ground planes (stuck on runway / boarding / hold-short)
  const waitingOnGround =
    stuck || plane.state === 'boarding' || (plane.state === 'taxiing_out' && plane.atHoldShort)
  if (waitingOnGround && plane.patience <= CONFIG.ui.patienceWarningThreshold * 2) {
    drawBar(ctx, plane, plane.patience,
      plane.patience <= CONFIG.ui.patienceWarningThreshold ? COLORS.planeCritical : COLORS.patienceBar)
  }
}

function drawBar(ctx: CanvasRenderingContext2D, plane: Plane, value: number, color: string): void {
  const barW = CONFIG.plane.width + 6
  const y = plane.y - CONFIG.plane.height - 6
  ctx.fillStyle = COLORS.barBg
  ctx.fillRect(plane.x - barW / 2, y, barW, 3)
  ctx.fillStyle = color
  ctx.fillRect(plane.x - barW / 2, y, barW * (value / 100), 3)
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { width } = CONFIG.canvas
  const pad = CONFIG.ui.hudPadding

  const remaining = Math.max(0, CONFIG.shift.durationSeconds - state.shiftTime)
  const m = Math.floor(remaining / 60)
  const s = Math.floor(remaining % 60)

  ctx.font = `bold ${CONFIG.ui.hudFontSize + 4}px monospace`
  ctx.fillStyle = remaining <= 30 ? COLORS.planeWarning : COLORS.hudBright
  ctx.textAlign = 'left'
  ctx.fillText(`${m}:${String(s).padStart(2, '0')}`, pad, pad + 16)

  ctx.textAlign = 'right'
  ctx.fillStyle = COLORS.hudBright
  ctx.fillText(String(state.stats.score), width - pad, pad + 16)

  const airborne = state.planes.filter((p) => p.isAirborneControllable).length
  ctx.font = `${CONFIG.ui.hudFontSize}px monospace`
  ctx.fillStyle = COLORS.hud
  ctx.textAlign = 'center'
  ctx.fillText(`${airborne} inbound`, width / 2, pad + 16)

  if (state.streak > 0) {
    ctx.fillStyle = COLORS.streak
    ctx.font = `bold ${CONFIG.ui.hudFontSize}px monospace`
    ctx.fillText(`near-miss x${state.streak}`, width / 2, pad + 32)
  }

  if (state.hudReputation !== null) {
    ctx.fillStyle = COLORS.hud
    ctx.font = `${CONFIG.ui.hudFontSize}px monospace`
    ctx.textAlign = 'left'
    ctx.fillText(`REP ${state.hudReputation}`, pad, pad + 34)
  }

  // Weather Radar perk: announce the next event before it fires
  if (state.modifiers.eventWarningSeconds > 0 && !state.pendingEvent) {
    const next = upcomingEvent(state)
    if (next && next.inSeconds > 0 && next.inSeconds <= state.modifiers.eventWarningSeconds) {
      ctx.fillStyle = COLORS.planeWarning
      ctx.font = `bold ${CONFIG.ui.hudFontSize}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(`RADAR: ${next.def.name} in ${Math.ceil(next.inSeconds)}s`, width / 2, pad + 48)
    }
  }
}

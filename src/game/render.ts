import { CONFIG, clockHourAt } from '../config'
import type { Gate } from './entities/gate'
import type { Plane } from './entities/plane'
import type { Runway } from './entities/runway'
import {
  frontEdge,
  getHeight,
  project,
  projectCircleRadii,
  projectCorners,
  updateBank,
  updateHeight,
  type ScreenPoint,
} from './iso'
import type { GameState } from './state'
import { upcomingEvent } from './systems/events'
import { satisfactionOf } from './systems/scoring'

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
  apron: 'rgba(30, 41, 66, 0.45)',
  apronEdge: 'rgba(74, 85, 104, 0.35)',
  shadow: 'rgba(0, 0, 0, 0.35)',
  runway: '#2a3142',
  runwaySide: '#171b26',
  runwayStripe: '#4a5568',
  terminal: '#1a2030',
  terminalSide: '#0e1119',
  gateSide: 'rgba(30, 41, 59, 0.6)',
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
  golden: '#fbbf24',
  slowMoTint: 'rgba(96, 165, 250, 0.07)',
  fuelGreen: '#4ade80',
  fuelBar: '#facc15',
  patienceBar: '#fb923c',
  barBg: 'rgba(148, 163, 184, 0.25)',
} as const

// Day/night palette keyframes: [clockHour, bgTop, bgBottom, nightness 0..1].
// Nightness drives runway edge lights and apron dimming.
const PALETTE: [number, string, string, number][] = [
  [6, '#241a2e', '#4e333c', 0.7],    // dawn: warm horizon, lights still on
  [8, '#142138', '#2b3c58', 0],      // morning daylight
  [16.5, '#142138', '#2b3c58', 0],   // afternoon
  [19, '#1d1530', '#52313f', 0.45],  // dusk
  [20.5, '#07090f', '#101728', 1],   // night
  [22, '#06080d', '#0d1320', 1],
]

function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  const mix = pa.map((v, i) => Math.round(v + (pb[i] - v) * t))
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`
}

function paletteAt(hour: number): { top: string; bottom: string; nightness: number } {
  const first = PALETTE[0]
  if (hour <= first[0]) return { top: first[1], bottom: first[2], nightness: first[3] }
  for (let i = 1; i < PALETTE.length; i++) {
    const [h1, top1, bottom1, n1] = PALETTE[i]
    if (hour <= h1) {
      const [h0, top0, bottom0, n0] = PALETTE[i - 1]
      const t = (hour - h0) / (h1 - h0)
      return {
        top: hexLerp(top0, top1, t),
        bottom: hexLerp(bottom0, bottom1, t),
        nightness: n0 + (n1 - n0) * t,
      }
    }
  }
  const last = PALETTE[PALETTE.length - 1]
  return { top: last[1], bottom: last[2], nightness: last[3] }
}

let vignette: CanvasGradient | null = null

function drawBackground(ctx: CanvasRenderingContext2D, hour: number, nightness: number): void {
  const { width, height } = CONFIG.canvas
  const sky = paletteAt(hour)
  const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
  bgGradient.addColorStop(0, sky.top)
  bgGradient.addColorStop(1, sky.bottom)
  ctx.fillStyle = bgGradient
  ctx.fillRect(0, 0, width, height)

  // apron: the paved field around runways and the V-terminal, dimmed at night.
  // Kept as a flat screen-space backdrop (not projected) — a simple ground wash
  // behind the projected buildings, same as the sky.
  ctx.globalAlpha = 1 - 0.35 * nightness
  ctx.fillStyle = COLORS.apron
  ctx.strokeStyle = COLORS.apronEdge
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(190, 232, 580, 358, 18)
  ctx.fill()
  ctx.stroke()
  ctx.globalAlpha = 1

  if (!vignette) {
    vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, width * 0.75)
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.4)')
  }
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)
}

// ---- world-space geometry helpers (rotated quads projected onto the iso grid) ----

interface WorldPoint {
  x: number
  y: number
}

function localToWorld(center: WorldPoint, angleDeg: number, alongLength: number, alongWidth: number): WorldPoint {
  const a = angleDeg * DEG
  const dirX = Math.cos(a)
  const dirY = Math.sin(a)
  const perpX = -dirY
  const perpY = dirX
  return { x: center.x + dirX * alongLength + perpX * alongWidth, y: center.y + dirY * alongLength + perpY * alongWidth }
}

/** Consistent winding rectangle corners — used for runways, the terminal ribbon, and gates (angle 0) */
function quadCorners(center: WorldPoint, angleDeg: number, length: number, width: number): WorldPoint[] {
  const halfL = length / 2
  const halfW = width / 2
  return [
    localToWorld(center, angleDeg, -halfL, -halfW),
    localToWorld(center, angleDeg, halfL, -halfW),
    localToWorld(center, angleDeg, halfL, halfW),
    localToWorld(center, angleDeg, -halfL, halfW),
  ]
}

/** Fills a projected quad's extruded side face (front edge only) then its top face */
function drawExtrudedQuad(
  ctx: CanvasRenderingContext2D,
  worldCorners: WorldPoint[],
  topFill: string,
  sideFill: string,
  extrusionPx: number,
  strokeStyle?: string,
  strokeWidth = 1
): ScreenPoint[] {
  const screenCorners = projectCorners(worldCorners)
  if (extrusionPx > 0) {
    const [a, b] = frontEdge(screenCorners)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineTo(b.x, b.y + extrusionPx)
    ctx.lineTo(a.x, a.y + extrusionPx)
    ctx.closePath()
    ctx.fillStyle = sideFill
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(screenCorners[0].x, screenCorners[0].y)
  for (let i = 1; i < screenCorners.length; i++) ctx.lineTo(screenCorners[i].x, screenCorners[i].y)
  ctx.closePath()
  ctx.fillStyle = topFill
  ctx.fill()
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle
    ctx.lineWidth = strokeWidth
    ctx.stroke()
  }
  return screenCorners
}

function projectedLine(ctx: CanvasRenderingContext2D, a: WorldPoint, b: WorldPoint): void {
  const pa = project(a.x, a.y, 0)
  const pb = project(b.x, b.y, 0)
  ctx.beginPath()
  ctx.moveTo(pa.x, pa.y)
  ctx.lineTo(pb.x, pb.y)
  ctx.stroke()
}

// ---- draw list: one depth-sorted pass over every ground+air entity ----

interface Drawable {
  depth: number
  draw: () => void
}

export function draw(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { width, height } = CONFIG.canvas
  const hour = clockHourAt(state.shiftTime)
  const nightness = paletteAt(hour).nightness
  drawBackground(ctx, hour, nightness)

  if (state.phase === 'pre_shift') return // React menu covers the canvas

  // screen shake: deterministic high-frequency wobble, decaying with remaining time
  ctx.save()
  if (state.shakeMs > 0 && state.shakeDurationMs > 0) {
    const amp = state.shakeIntensity * (state.shakeMs / state.shakeDurationMs)
    ctx.translate(Math.sin(state.shiftTime * 53) * amp, Math.cos(state.shiftTime * 47) * amp)
  }

  drawHoldingRings(ctx, state)

  const items: Drawable[] = []
  for (const runway of state.runways) {
    items.push({
      depth: runway.y,
      draw: () => drawRunway(ctx, runway, state.shiftTime, nightness),
    })
  }
  for (const arm of terminalArms(state.gates)) {
    items.push({ depth: arm.depth, draw: () => drawTerminalArm(ctx, arm) })
  }
  for (const gate of state.gates) {
    items.push({ depth: gate.y, draw: () => drawGate(ctx, gate) })
  }
  for (const plane of state.planes) {
    items.push({
      depth: plane.y,
      draw: () => drawPlane(ctx, plane, plane.id === state.selectedPlaneId, state.shiftTime),
    })
  }
  items.sort((a, b) => a.depth - b.depth)
  for (const item of items) item.draw()

  drawAssignmentLines(ctx, state)
  drawHud(ctx, state)
  ctx.restore()

  if (state.slowMoMs > 0) {
    ctx.fillStyle = COLORS.slowMoTint
    ctx.fillRect(0, 0, width, height)
  }
}

interface TerminalArm {
  center: WorldPoint
  angleDeg: number
  length: number
  width: number
  depth: number
  gates: Gate[]
}

function terminalArms(gates: Gate[]): TerminalArm[] {
  const G = CONFIG.gate
  const apex = { x: G.apexX, y: G.apexY }
  const arms: TerminalArm[] = []
  for (const side of [-1, 1]) {
    const armGates = gates.filter((g) => (g.id % 2 === 0 ? -1 : 1) === side)
    if (armGates.length === 0) continue
    const outer = armGates[armGates.length - 1]
    const overshoot = 36
    const dx = outer.x - apex.x
    const dy = outer.y - apex.y
    const len = Math.hypot(dx, dy)
    const tip = { x: apex.x + (dx / len) * (len + overshoot), y: apex.y + (dy / len) * (len + overshoot) }
    const center = { x: (apex.x + tip.x) / 2, y: (apex.y + tip.y) / 2 }
    arms.push({
      center,
      angleDeg: Math.atan2(dy, dx) / DEG,
      length: len + overshoot,
      width: G.sizePixels + 18,
      depth: center.y,
      gates: armGates,
    })
  }
  return arms
}

function drawTerminalArm(ctx: CanvasRenderingContext2D, arm: TerminalArm): void {
  const corners = quadCorners(arm.center, arm.angleDeg, arm.length, arm.width)
  drawExtrudedQuad(ctx, corners, COLORS.terminal, COLORS.terminalSide, CONFIG.iso.buildingExtrusionPx)
}

function drawHoldingRings(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { holdingCenterX, holdingCenterY, holdingRadiusBase, holdingRadiusStep } = CONFIG.approach
  let rings = 1
  for (const p of state.planes) {
    if (p.state === 'holding') rings = Math.max(rings, p.ringIndex + 1)
  }
  const center = project(holdingCenterX, holdingCenterY, 0)
  ctx.strokeStyle = COLORS.holdRing
  ctx.lineWidth = 1
  for (let i = 0; i < rings; i++) {
    const { rx, ry } = projectCircleRadii(holdingRadiusBase + i * holdingRadiusStep)
    ctx.beginPath()
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawRunway(ctx: CanvasRenderingContext2D, runway: Runway, shiftTime: number, nightness: number): void {
  const { lengthPixels } = CONFIG.runway
  const widthPixels = runway.width
  const closed = shiftTime < runway.closedUntil
  const center = { x: runway.x, y: runway.y }
  const halfL = lengthPixels / 2
  const halfW = widthPixels / 2

  const corners = quadCorners(center, runway.angle, lengthPixels, widthPixels)
  drawExtrudedQuad(ctx, corners, COLORS.runway, COLORS.runwaySide, CONFIG.iso.groundExtrusionPx)

  // edge lights after dark (and at dawn): paired amber dots along both sides
  if (nightness > 0.05) {
    ctx.fillStyle = `rgba(255, 214, 140, ${0.85 * nightness})`
    for (let x = -halfL + 8; x <= halfL - 8; x += 18) {
      for (const wOff of [-halfW - 3, halfW + 1]) {
        const p = project(localToWorld(center, runway.angle, x, wOff).x, localToWorld(center, runway.angle, x, wOff).y, 0)
        ctx.fillRect(p.x - 1.25, p.y - 1.25, 2.5, 2.5)
      }
    }
  }

  // centerline dashes
  ctx.strokeStyle = COLORS.runwayStripe
  ctx.lineWidth = 2
  ctx.setLineDash([8, 8])
  projectedLine(
    ctx,
    localToWorld(center, runway.angle, -halfL + 6, 0),
    localToWorld(center, runway.angle, halfL - 6, 0)
  )
  ctx.setLineDash([])

  // threshold stripe at touchdown end
  const stripeCorners = quadCorners(
    localToWorld(center, runway.angle, -halfL + 2, 0),
    runway.angle,
    4,
    widthPixels
  )
  const stripeScreen = projectCorners(stripeCorners)
  ctx.beginPath()
  ctx.moveTo(stripeScreen[0].x, stripeScreen[0].y)
  for (let i = 1; i < stripeScreen.length; i++) ctx.lineTo(stripeScreen[i].x, stripeScreen[i].y)
  ctx.closePath()
  ctx.fillStyle = COLORS.runwayStripe
  ctx.fill()

  // size tag at the threshold: L accepts everyone, S is narrow-body only (billboarded upright)
  const tagAnchor = project(localToWorld(center, runway.angle, -halfL - 12, 0).x, localToWorld(center, runway.angle, -halfL - 12, 0).y, 0)
  ctx.fillStyle = runway.size === 'large' ? COLORS.hudBright : COLORS.hud
  ctx.font = `bold ${CONFIG.ui.hudFontSize}px monospace`
  ctx.textAlign = 'center'
  ctx.fillText(runway.size === 'large' ? 'L' : 'S', tagAnchor.x, tagAnchor.y + 4)

  if (closed) {
    ctx.strokeStyle = COLORS.planeCritical
    ctx.lineWidth = 2
    for (let x = -halfL; x < halfL; x += 14) {
      projectedLine(ctx, localToWorld(center, runway.angle, x, -halfW), localToWorld(center, runway.angle, x + 8, halfW))
    }
    const label = project(center.x, center.y, 0)
    ctx.fillStyle = COLORS.planeCritical
    ctx.font = `bold ${CONFIG.ui.hudFontSize}px monospace`
    ctx.fillText('CLOSED', label.x, label.y - halfW * 0.6 - 6)
  } else if (!runway.free) {
    const outline = quadCorners(center, runway.angle, lengthPixels + 6, widthPixels + 6)
    const screenOutline = projectCorners(outline)
    ctx.strokeStyle = COLORS.planeCritical
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(screenOutline[0].x, screenOutline[0].y)
    for (let i = 1; i < screenOutline.length; i++) ctx.lineTo(screenOutline[i].x, screenOutline[i].y)
    ctx.closePath()
    ctx.stroke()
  }

  // queue count
  if (runway.queue.length > 0) {
    const anchor = project(center.x, center.y, 0)
    ctx.fillStyle = COLORS.hudBright
    ctx.font = `bold ${CONFIG.ui.hudFontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(`+${runway.queue.length}`, anchor.x, anchor.y + halfW * 0.6 + 14)
  }
}

function drawGate(ctx: CanvasRenderingContext2D, gate: Gate): void {
  const size = gate.boxSize
  const corners = quadCorners({ x: gate.x, y: gate.y }, 0, size, size)
  let topFill = 'transparent'
  let strokeStyle: string | undefined
  let strokeWidth = 1
  let dash: number[] = []
  if (gate.occupied) {
    topFill = COLORS.gateOccupied
  } else if (!gate.free) {
    strokeStyle = COLORS.gateReserved
    strokeWidth = 1.5
    dash = [4, 4]
  } else {
    strokeStyle = gate.size === 'large' ? COLORS.hudBright : COLORS.gateFree
    strokeWidth = gate.size === 'large' ? 1.5 : 1
  }
  ctx.setLineDash(dash)
  drawExtrudedQuad(ctx, corners, topFill, COLORS.gateSide, CONFIG.iso.gateExtrusionPx, strokeStyle, strokeWidth)
  ctx.setLineDash([])

  const label = project(gate.x, gate.y, 0)
  ctx.fillStyle = COLORS.hud
  ctx.font = `${CONFIG.ui.hudFontSize - 2}px monospace`
  ctx.textAlign = 'center'
  ctx.fillText(`G${gate.id + 1}${gate.size === 'large' ? '·L' : ''}`, label.x, label.y + size * 0.15 + 18)
}

function drawAssignmentLines(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.lineWidth = 1
  for (const plane of state.planes) {
    const planeScreen = project(plane.x, plane.y, getHeight(plane))
    if (plane.isAirborneControllable && plane.assignedRunway) {
      const target = project(plane.assignedRunway.x, plane.assignedRunway.y, 0)
      ctx.strokeStyle = COLORS.assignLine
      ctx.beginPath()
      ctx.moveTo(planeScreen.x, planeScreen.y)
      ctx.lineTo(target.x, target.y)
      ctx.stroke()
    }
    const showGateLine =
      plane.assignedGate &&
      (plane.isAirborneControllable || plane.state === 'landing' || plane.state === 'rolling')
    if (showGateLine) {
      const target = project(plane.assignedGate!.x, plane.assignedGate!.y, 0)
      ctx.strokeStyle = COLORS.gateLine
      ctx.beginPath()
      ctx.moveTo(planeScreen.x, planeScreen.y)
      ctx.lineTo(target.x, target.y)
      ctx.stroke()
    }
  }
}

function planeColor(plane: Plane, shiftTime: number): string {
  if (plane.kind === 'medical') {
    // urgent pulse between critical red and white
    return Math.sin(shiftTime * 10) > 0 ? COLORS.planeCritical : COLORS.plane
  }
  if (plane.golden) return COLORS.golden
  if (plane.kind === 'vip') return COLORS.vip
  if (plane.fuel <= CONFIG.ui.fuelWarningThreshold / 2) return COLORS.planeCritical
  if (plane.fuel <= CONFIG.ui.fuelWarningThreshold) return COLORS.planeWarning
  return COLORS.plane
}

/** On-screen heading angle: projects a short step ahead of the plane and reads the screen-space delta, so anisotropic scaleX/scaleY doesn't distort the sprite's facing */
function screenHeading(plane: Plane): number {
  const p0 = project(plane.x, plane.y, 0)
  const ahead = project(plane.x + Math.cos(plane.heading) * 10, plane.y + Math.sin(plane.heading) * 10, 0)
  return Math.atan2(ahead.y - p0.y, ahead.x - p0.x)
}

function drawPlane(ctx: CanvasRenderingContext2D, plane: Plane, selected: boolean, shiftTime: number): void {
  if (plane.state === 'departed' || plane.state === 'diverted') return
  const stuck = plane.state === 'rolling' && plane.rolloutDone && !plane.assignedGate

  const heightPx = updateHeight(plane)
  const bank = updateBank(plane)
  const heading = screenHeading(plane)
  const bodyPos = project(plane.x, plane.y, heightPx)
  const shadowPos = project(plane.x, plane.y, 0)

  if (selected || (stuck && Math.sin(shiftTime * 8) > 0)) {
    ctx.strokeStyle = selected ? COLORS.selection : COLORS.planeCritical
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(bodyPos.x, bodyPos.y, CONFIG.plane.hitRadiusPixels * 0.8, CONFIG.plane.hitRadiusPixels * 0.5, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  const scale = (CONFIG.plane.width / PLANE_BASELINE_WIDTH) * CONFIG.plane.sizes[plane.size].visualScale
  const bankSquish = 1 - Math.abs(bank) * 0.3

  // drop shadow on the ground, under wherever the plane currently is
  ctx.save()
  ctx.translate(shadowPos.x, shadowPos.y)
  ctx.rotate(heading)
  ctx.scale(scale, scale)
  ctx.fillStyle = COLORS.shadow
  ctx.fill(getPlanePath())
  ctx.restore()

  ctx.save()
  ctx.translate(bodyPos.x, bodyPos.y)
  ctx.rotate(heading)
  ctx.scale(scale, scale * bankSquish)
  if (plane.state === 'at_gate') {
    // refuelling / boarding passengers: ghosted out until turnaround completes
    ctx.globalAlpha = 0.45
  } else if (plane.golden && plane.state !== 'boarding') {
    // the shift's jackpot flight: always aglow
    ctx.shadowColor = COLORS.golden
    ctx.shadowBlur = 10 * scale
  } else if (plane.state === 'boarding' && plane.boardingStart !== null) {
    // ready to depart: pulsing glow, green while fresh, yellow as the window drains
    const remaining = Math.max(0, 1 - (shiftTime - plane.boardingStart) / CONFIG.gate.departWindowSeconds)
    ctx.shadowColor =
      plane.gateDelaySeconds > 0 ? COLORS.planeCritical : remaining > 0.5 ? COLORS.fuelGreen : COLORS.fuelBar
    ctx.shadowBlur = (10 + 5 * Math.sin(shiftTime * 6)) * scale
  }
  ctx.fillStyle = planeColor(plane, shiftTime)
  ctx.fill(getPlanePath())
  ctx.restore()

  const { height: h } = CONFIG.plane

  // callsign + always-on fuel countdown bar (airborne)
  if (plane.isAirborneControllable) {
    ctx.fillStyle = COLORS.hud
    ctx.font = `${CONFIG.ui.hudFontSize - 2}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(plane.callsign, bodyPos.x, bodyPos.y - h - 10)

    drawBar(ctx, bodyPos, plane.fuel / 100, fuelColor(plane.fuel / 100))
    return
  }

  // boarding: the 3-minute departure countdown
  if (plane.state === 'boarding' && plane.boardingStart !== null) {
    const remaining = Math.max(0, 1 - (shiftTime - plane.boardingStart) / CONFIG.gate.departWindowSeconds)
    const overdue = plane.gateDelaySeconds > 0
    const color = overdue
      ? Math.sin(shiftTime * 8) > 0 ? COLORS.planeCritical : COLORS.barBg // overdue: flashing red
      : fuelColor(remaining)
    drawBar(ctx, bodyPos, overdue ? 1 : remaining, color)
    return
  }

  // patience bar on other waiting ground planes (stuck on runway / hold-short)
  const waitingOnGround = stuck || (plane.state === 'taxiing_out' && plane.atHoldShort)
  if (waitingOnGround && plane.patience <= CONFIG.ui.patienceWarningThreshold * 2) {
    drawBar(
      ctx,
      bodyPos,
      plane.patience / 100,
      plane.patience <= CONFIG.ui.patienceWarningThreshold ? COLORS.planeCritical : COLORS.patienceBar
    )
  }
}

function satisfactionColor(pct: number): string {
  if (pct >= 90) return COLORS.fuelGreen
  if (pct >= 70) return COLORS.planeWarning
  return COLORS.planeCritical
}

/** green above half, yellow above a quarter, red below — fraction in [0,1] */
function fuelColor(fraction: number): string {
  if (fraction > 0.5) return COLORS.fuelGreen
  if (fraction > 0.25) return COLORS.fuelBar
  return COLORS.planeCritical
}

/** Billboarded (never rotated/skewed) status bar above a plane's projected screen position */
function drawBar(ctx: CanvasRenderingContext2D, screenPos: ScreenPoint, fraction: number, color: string): void {
  const barW = CONFIG.plane.width + 8
  const y = screenPos.y - CONFIG.plane.height - 7
  ctx.fillStyle = COLORS.barBg
  ctx.fillRect(screenPos.x - barW / 2, y, barW, 4)
  ctx.fillStyle = color
  ctx.fillRect(screenPos.x - barW / 2, y, barW * Math.max(0, Math.min(1, fraction)), 4)
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { width } = CONFIG.canvas
  const pad = CONFIG.ui.hudPadding

  // 24h clock: the shift is one airport day, 06:00 -> 22:00
  const hour = clockHourAt(state.shiftTime)
  const hh = Math.floor(hour)
  const mm = Math.floor((hour - hh) * 60)
  const remaining = Math.max(0, CONFIG.shift.durationSeconds - state.shiftTime)
  ctx.font = `bold ${CONFIG.ui.hudFontSize + 4}px monospace`
  ctx.fillStyle = remaining <= 30 ? COLORS.planeWarning : COLORS.hudBright
  ctx.textAlign = 'left'
  ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, pad, pad + 16)

  // headline score: passenger satisfaction; ops points beneath it
  const satisfaction = satisfactionOf(state.stats)
  ctx.textAlign = 'right'
  ctx.fillStyle = satisfactionColor(satisfaction)
  ctx.fillText(`${satisfaction}%`, width - pad, pad + 16)
  ctx.font = `${CONFIG.ui.hudFontSize - 2}px monospace`
  ctx.fillStyle = COLORS.hud
  ctx.fillText(String(Math.round(state.stats.score)), width - pad, pad + 32)

  const airborne = state.planes.filter((p) => p.isAirborneControllable).length
  ctx.font = `${CONFIG.ui.hudFontSize}px monospace`
  ctx.fillStyle = COLORS.hud
  ctx.textAlign = 'center'
  const d00 =
    state.stats.departed > 0
      ? ` · D:00 ${Math.round((100 * state.stats.departedOnTime) / state.stats.departed)}%`
      : ''
  const a00 =
    state.stats.landed > 0
      ? ` · A:00 ${Math.round((100 * state.stats.arrivedOnTime) / state.stats.landed)}%`
      : ''
  const target = state.hudTarget !== null ? ` · beat ${state.hudTarget}%` : ''
  ctx.fillText(`${airborne} inbound${d00}${a00}${target}`, width / 2, pad + 16)

  if (state.warning) {
    ctx.fillStyle = COLORS.planeWarning
    ctx.font = `bold ${CONFIG.ui.hudFontSize + 2}px monospace`
    ctx.fillText(state.warning.text, width / 2, pad + 70)
  }

  const line2 = [
    state.streak > 0 ? `near-miss x${state.streak}` : '',
    state.onTimeCombo >= 2 ? `on-time x${state.onTimeCombo}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  if (line2) {
    ctx.fillStyle = state.onTimeCombo >= 2 ? COLORS.golden : COLORS.streak
    ctx.font = `bold ${CONFIG.ui.hudFontSize}px monospace`
    ctx.fillText(line2, width / 2, pad + 32)
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

  // fog "close one runway": prompt the player to pick a strip
  if (state.runwayPick) {
    ctx.fillStyle = COLORS.planeWarning
    ctx.font = `bold ${CONFIG.ui.hudFontSize + 2}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText('FOG ROLLING IN — CLICK A RUNWAY TO CLOSE', width / 2, pad + 88)
  }

  // stranded wide-body: a large plane is up but no large runway is open
  const strandedLarge =
    state.planes.some((p) => p.size === 'large' && p.isAirborneControllable) &&
    !state.runways.some((r) => r.size === 'large' && state.shiftTime >= r.closedUntil)
  if (strandedLarge) {
    ctx.fillStyle = COLORS.planeCritical
    ctx.font = `bold ${CONFIG.ui.hudFontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(
      `no large runway open — double-click a plane to divert (fuel > ${CONFIG.scoring.rerouteMinFuelPct}%)`,
      width / 2,
      pad + 106
    )
  }
}

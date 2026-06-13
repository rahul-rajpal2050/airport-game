import { CONFIG, clockHourAt } from '../config'
import type { Gate } from './entities/gate'
import type { Plane } from './entities/plane'
import type { Runway } from './entities/runway'
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

  // apron: the paved field around runways and the V-terminal, dimmed at night
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
  drawTerminal(ctx, state.gates)
  for (const runway of state.runways) drawRunway(ctx, runway, state.shiftTime, nightness)
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
  const G = CONFIG.gate

  // V-terminal building: two arm strips from the apex out past the last gate
  ctx.strokeStyle = COLORS.terminal
  ctx.lineCap = 'round'
  ctx.lineWidth = G.sizePixels + 18
  for (const arm of [-1, 1]) {
    const armGates = gates.filter((g) => (g.id % 2 === 0 ? -1 : 1) === arm)
    if (armGates.length === 0) continue
    const outer = armGates[armGates.length - 1]
    const overshoot = 36
    const dx = outer.x - G.apexX
    const dy = outer.y - G.apexY
    const len = Math.hypot(dx, dy)
    ctx.beginPath()
    ctx.moveTo(G.apexX, G.apexY)
    ctx.lineTo(G.apexX + (dx / len) * (len + overshoot), G.apexY + (dy / len) * (len + overshoot))
    ctx.stroke()
  }
  ctx.lineCap = 'butt'

  ctx.font = `${CONFIG.ui.hudFontSize - 2}px monospace`
  ctx.textAlign = 'center'
  for (const gate of gates) {
    const size = gate.boxSize
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
      ctx.strokeStyle = gate.size === 'large' ? COLORS.hudBright : COLORS.gateFree
      ctx.lineWidth = gate.size === 'large' ? 1.5 : 1
      ctx.strokeRect(gate.x - size / 2, gate.y - size / 2, size, size)
    }
    ctx.fillStyle = COLORS.hud
    ctx.fillText(`G${gate.id + 1}${gate.size === 'large' ? '·L' : ''}`, gate.x, gate.y + size / 2 + 16)
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

function drawRunway(
  ctx: CanvasRenderingContext2D,
  runway: Runway,
  shiftTime: number,
  nightness = 0
): void {
  const { lengthPixels } = CONFIG.runway
  const widthPixels = runway.width
  const closed = shiftTime < runway.closedUntil
  ctx.save()
  ctx.translate(runway.x, runway.y)
  ctx.rotate(runway.angle * DEG)

  ctx.fillStyle = COLORS.runway
  ctx.fillRect(-lengthPixels / 2, -widthPixels / 2, lengthPixels, widthPixels)

  // edge lights after dark (and at dawn): paired amber dots along both sides
  if (nightness > 0.05) {
    ctx.fillStyle = `rgba(255, 214, 140, ${0.85 * nightness})`
    for (let x = -lengthPixels / 2 + 8; x <= lengthPixels / 2 - 8; x += 18) {
      ctx.fillRect(x, -widthPixels / 2 - 3, 2.5, 2.5)
      ctx.fillRect(x, widthPixels / 2 + 1, 2.5, 2.5)
    }
  }

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

  // size tag at the threshold: L accepts everyone, S is narrow-body only
  ctx.fillStyle = runway.size === 'large' ? COLORS.hudBright : COLORS.hud
  ctx.font = `bold ${CONFIG.ui.hudFontSize}px monospace`
  ctx.textAlign = 'center'
  ctx.fillText(runway.size === 'large' ? 'L' : 'S', -lengthPixels / 2 - 12, 4)

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
  const { height: h } = CONFIG.plane
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

  const scale = (CONFIG.plane.width / PLANE_BASELINE_WIDTH) * CONFIG.plane.sizes[plane.size].visualScale
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
  if (plane.state === 'at_gate') {
    // refuelling / boarding passengers: ghosted out until turnaround completes
    ctx.globalAlpha = 0.45
  } else if (plane.state === 'boarding' && plane.boardingStart !== null) {
    // ready to depart: pulsing glow, green while fresh, yellow as the window drains
    const remaining = Math.max(
      0,
      1 - (shiftTime - plane.boardingStart) / CONFIG.gate.departWindowSeconds
    )
    ctx.shadowColor =
      plane.gateDelaySeconds > 0 ? COLORS.planeCritical : remaining > 0.5 ? COLORS.fuelGreen : COLORS.fuelBar
    ctx.shadowBlur = (10 + 5 * Math.sin(shiftTime * 6)) * scale
  }
  ctx.fillStyle = planeColor(plane, shiftTime)
  ctx.fill(getPlanePath())
  ctx.restore()

  // callsign + always-on fuel countdown bar (airborne)
  if (plane.isAirborneControllable) {
    ctx.fillStyle = COLORS.hud
    ctx.font = `${CONFIG.ui.hudFontSize - 2}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(plane.callsign, plane.x, plane.y - h - 10)

    drawBar(ctx, plane, plane.fuel / 100, fuelColor(plane.fuel / 100))
    return
  }

  // boarding: the 3-minute departure countdown
  if (plane.state === 'boarding' && plane.boardingStart !== null) {
    const remaining = Math.max(
      0,
      1 - (shiftTime - plane.boardingStart) / CONFIG.gate.departWindowSeconds
    )
    const overdue = plane.gateDelaySeconds > 0
    const color = overdue
      ? Math.sin(shiftTime * 8) > 0 ? COLORS.planeCritical : COLORS.barBg // overdue: flashing red
      : fuelColor(remaining)
    drawBar(ctx, plane, overdue ? 1 : remaining, color)
    return
  }

  // patience bar on other waiting ground planes (stuck on runway / hold-short)
  const waitingOnGround = stuck || (plane.state === 'taxiing_out' && plane.atHoldShort)
  if (waitingOnGround && plane.patience <= CONFIG.ui.patienceWarningThreshold * 2) {
    drawBar(ctx, plane, plane.patience / 100,
      plane.patience <= CONFIG.ui.patienceWarningThreshold ? COLORS.planeCritical : COLORS.patienceBar)
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

function drawBar(ctx: CanvasRenderingContext2D, plane: Plane, fraction: number, color: string): void {
  const barW = CONFIG.plane.width + 8
  const y = plane.y - CONFIG.plane.height - 7
  ctx.fillStyle = COLORS.barBg
  ctx.fillRect(plane.x - barW / 2, y, barW, 4)
  ctx.fillStyle = color
  ctx.fillRect(plane.x - barW / 2, y, barW * Math.max(0, Math.min(1, fraction)), 4)
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
  ctx.fillText(`${airborne} inbound${d00}${a00}`, width / 2, pad + 16)

  if (state.warning) {
    ctx.fillStyle = COLORS.planeWarning
    ctx.font = `bold ${CONFIG.ui.hudFontSize + 2}px monospace`
    ctx.fillText(state.warning.text, width / 2, pad + 70)
  }

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

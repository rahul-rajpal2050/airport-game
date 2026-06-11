import { CONFIG, type EventEffect, type GameEventDef } from '../../config'
import type { RNG } from '../../utils/rng'
import type { GameState } from '../state'

export interface ScheduledEvent {
  defId: string
  time: number
}

export interface PendingEvent {
  def: GameEventDef
  markedPlaneId: number | null
  markedRunwayId: number | null
  autoResolveMsLeft: number
}

export interface ActiveEffect {
  type: 'patience_mult' | 'fuel_mult' | 'go_around_risk'
  expiresAt: number
  mult: number
  probability: number
  runwayId: number | null // null = all runways
}

/**
 * Pre-rolls which events fire this shift and when, from the seeded RNG.
 * Draw order is fixed (after the spawn schedule) — the determinism contract.
 * Forced events (shift archetypes) are guaranteed; the rest are random distinct picks.
 */
export function generateEventSchedule(
  rng: RNG,
  options?: { count?: number; forced?: string[] }
): ScheduledEvent[] {
  const count = Math.min(options?.count ?? CONFIG.events.maxPerShift, CONFIG.events.defs.length)
  const defs = [...CONFIG.events.defs]
  const picked: ScheduledEvent[] = []

  for (const forcedId of options?.forced ?? []) {
    const idx = defs.findIndex((d) => d.id === forcedId)
    if (idx === -1) continue
    const def = defs.splice(idx, 1)[0]
    picked.push({ defId: def.id, time: rng.float(def.windowSeconds[0], def.windowSeconds[1]) })
  }
  while (picked.length < count && defs.length > 0) {
    const def = defs.splice(rng.int(0, defs.length - 1), 1)[0]
    picked.push({ defId: def.id, time: rng.float(def.windowSeconds[0], def.windowSeconds[1]) })
  }
  return picked.sort((a, b) => a.time - b.time)
}

/** Next scheduled-but-unfired event, for the Weather Radar HUD warning */
export function upcomingEvent(state: GameState): { def: GameEventDef; inSeconds: number } | null {
  if (state.eventIndex >= state.eventSchedule.length) return null
  const next = state.eventSchedule[state.eventIndex]
  const def = CONFIG.events.defs.find((d) => d.id === next.defId)
  if (!def) return null
  return { def, inSeconds: next.time - state.shiftTime }
}

export function rollRiskLottery(rng: RNG): number[] {
  return Array.from({ length: CONFIG.events.riskLotterySize }, () => rng.next())
}

/** Fire due events (deferring while a dialog is open) and tick medical deadlines */
export function tickEvents(state: GameState): void {
  if (
    state.pendingEvent === null &&
    state.eventIndex < state.eventSchedule.length &&
    state.eventSchedule[state.eventIndex].time <= state.shiftTime
  ) {
    const scheduled = state.eventSchedule[state.eventIndex++]
    const def = CONFIG.events.defs.find((d) => d.id === scheduled.defId)
    if (def) fireEvent(state, def)
  }

  // expire stale effects
  state.activeEffects = state.activeEffects.filter((e) => e.expiresAt > state.shiftTime)

  // medical deadline: still airborne past the deadline -> forced diversion
  for (const plane of state.planes) {
    if (
      plane.kind === 'medical' &&
      plane.kindDeadline !== null &&
      state.shiftTime > plane.kindDeadline &&
      plane.isAirborneControllable
    ) {
      plane.assignedRunway?.removeFromQueue(plane)
      plane.transition('diverted')
      state.events.push({ type: 'diverted', plane })
    }
  }
}

function fireEvent(state: GameState, def: GameEventDef): void {
  const pending: PendingEvent = {
    def,
    markedPlaneId: null,
    markedRunwayId: null,
    autoResolveMsLeft: CONFIG.events.autoResolveSeconds * 1000,
  }
  state.pendingEvent = pending
  applyEffects(state, def.onFire ?? [], pending)
  state.events.push({ type: 'event_fired', defId: def.id })
}

/** Player choice (or auto-resolve). Applies the chosen option's effects. */
export function resolveEvent(state: GameState, optionIndex: 0 | 1): void {
  const pending = state.pendingEvent
  if (!pending) return
  applyEffects(state, pending.def.options[optionIndex].effects, pending)
  state.pendingEvent = null
}

function applyEffects(state: GameState, effects: EventEffect[], pending: PendingEvent): void {
  for (const effect of effects) {
    switch (effect.type) {
      case 'close_runway': {
        const id = effect.runwayId === 'marked' ? (pending.markedRunwayId ?? 0) : effect.runwayId
        const runway = state.runways[id]
        if (runway) runway.closedUntil = state.shiftTime + effect.durationSeconds
        break
      }
      case 'patience_mult':
      case 'fuel_mult':
        state.activeEffects.push({
          type: effect.type,
          expiresAt: state.shiftTime + effect.durationSeconds,
          mult: effect.mult,
          probability: 0,
          runwayId: null,
        })
        break
      case 'go_around_risk': {
        const runwayId =
          effect.runwayId === 'marked' ? (pending.markedRunwayId ?? null) : (effect.runwayId ?? null)
        state.activeEffects.push({
          type: 'go_around_risk',
          expiresAt: state.shiftTime + effect.durationSeconds,
          mult: 1,
          probability: effect.probability,
          runwayId,
        })
        break
      }
      case 'mark_plane':
        markPlane(state, effect.kind, pending)
        break
      case 'queue_jump':
        queueJump(state, pending)
        break
      case 'next_rollout_mult':
        state.nextRolloutMult = effect.mult
        // remember which runway eats the long rollout, for 'marked' targeting
        pending.markedRunwayId = nextLandingRunwayId(state)
        break
      case 'score_delta':
        state.stats.score += effect.amount
        break
    }
  }
}

function markPlane(state: GameState, kind: 'medical' | 'vip', pending: PendingEvent): void {
  if (kind === 'vip') {
    state.nextSpawnKind = 'vip' // consumed by the next spawn
    return
  }
  // medical: the longest-holding airborne plane (most dramatic, most fair)
  let target = null
  for (const p of state.planes) {
    if (!p.isAirborneControllable) continue
    if (target === null || p.holdSeconds > target.holdSeconds) target = p
  }
  if (!target) return
  target.kind = 'medical'
  target.kindDeadline = state.shiftTime + CONFIG.events.medical.landWithinSeconds
  pending.markedPlaneId = target.id
}

function queueJump(state: GameState, pending: PendingEvent): void {
  if (pending.markedPlaneId === null) {
    // marked plane hasn't spawned yet (VIP): grant priority at spawn instead
    if (state.nextSpawnKind === 'vip') state.vipPriority = true
    return
  }
  const plane = state.planes.find((p) => p.id === pending.markedPlaneId)
  if (!plane || !plane.isAirborneControllable) return
  if (plane.assignedRunway) {
    const q = plane.assignedRunway.queue
    const i = q.indexOf(plane)
    if (i > 0) {
      q.splice(i, 1)
      q.unshift(plane)
    }
  } else {
    const emptier = state.runways.reduce((a, b) => (a.queue.length <= b.queue.length ? a : b))
    plane.assignedRunway = emptier
    emptier.queue.unshift(plane)
  }
}

function nextLandingRunwayId(state: GameState): number | null {
  // a plane already on final, else the runway whose queue head will land next
  for (const r of state.runways) {
    if (r.current?.state === 'landing') return r.id
  }
  for (const r of state.runways) {
    if (r.queue.some((p) => p.isAirborneControllable)) return r.id
  }
  return null
}

export function patienceMultiplier(state: GameState): number {
  let m = 1
  for (const e of state.activeEffects) if (e.type === 'patience_mult') m *= e.mult
  return m
}

export function fuelMultiplier(state: GameState): number {
  let m = 1
  for (const e of state.activeEffects) if (e.type === 'fuel_mult') m *= e.mult
  return m
}

export function goAroundProbability(state: GameState, runwayId: number): number {
  let p = 0
  for (const e of state.activeEffects) {
    if (e.type === 'go_around_risk' && (e.runwayId === null || e.runwayId === runwayId)) {
      p = Math.max(p, e.probability)
    }
  }
  return p
}

/** Consumes the next pre-rolled lottery float. Deterministic per seed + input sequence. */
export function consumeRiskRoll(state: GameState): number {
  const roll = state.riskRolls[state.riskIndex % state.riskRolls.length]
  state.riskIndex++
  return roll
}

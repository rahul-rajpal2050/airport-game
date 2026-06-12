export type PlaneSize = 'small' | 'large'

// Event definitions are data: an event is a combination of effect primitives.
// Adding an event = adding a def below. New primitive = code in systems/events.ts.
export type EventEffect =
  | { type: 'close_runway'; runwayId: number | 'marked'; durationSeconds: number }
  | { type: 'patience_mult'; mult: number; durationSeconds: number }
  | { type: 'fuel_mult'; mult: number; durationSeconds: number }
  | { type: 'go_around_risk'; probability: number; durationSeconds: number; runwayId?: number | 'marked' }
  | { type: 'mark_plane'; kind: 'medical' | 'vip' }
  | { type: 'queue_jump' }
  | { type: 'next_rollout_mult'; mult: number }
  | { type: 'score_delta'; amount: number }

export interface EventOptionDef {
  label: string
  description: string
  effects: EventEffect[]
}

export interface GameEventDef {
  id: string
  name: string
  description: string
  /** fire time is seeded-rolled inside this shiftTime window */
  windowSeconds: [number, number]
  /** applied at fire time, before the player chooses */
  onFire?: EventEffect[]
  options: [EventOptionDef, EventOptionDef]
}

// Perk modifiers applied at shift start. Identity values = no perk.
export interface Modifiers {
  turnaroundMult: number
  fuelDrainMult: number
  patienceDrainMult: number
  extraRunways: number
  extraGates: number
  eventWarningSeconds: number
}

export function identityModifiers(): Modifiers {
  return {
    turnaroundMult: 1,
    fuelDrainMult: 1,
    patienceDrainMult: 1,
    extraRunways: 0,
    extraGates: 0,
    eventWarningSeconds: 0,
  }
}

export interface PerkDef {
  id: string
  name: string
  description: string
  repCost: number
  modifiers: Partial<Modifiers>
}

export interface ShiftArchetype {
  id: string
  name: string
  description: string
  spawnRateMult: number
  eventCount: number
  forcedEvents?: string[]
  /** runway indices closed for the entire shift */
  closedRunways?: number[]
  /** reputation deltas scaled by this (VIP Day) */
  repDeltaMult?: number
}

export const CONFIG = {
  canvas: {
    // Logical resolution — scaled to fill the viewport. Landscape, laptop-first.
    width: 960,
    height: 600,
    targetFps: 60,
  },

  shift: {
    durationSeconds: 300,
    largeProbability: 0.35,    // share of spawns that are wide-body (seeded roll)
    // The shift is a compressed airport day: the clock runs dayStartHour -> dayEndHour
    // over durationSeconds (06:00-22:00 in 5 minutes ≈ 18.75s per in-game hour).
    dayStartHour: 6,
    dayEndHour: 22,
    // [clockHour, planesPerMinute] — piecewise linear, shaped as four rush waves
    // (7-9, 11-13, 15-17, 19-21) with breathing room between. Capacity-aware:
    // with 60s/120s circling budgets, sustained demand beyond ~8/min is unwinnable.
    spawnCurveByHour: [
      [6, 3],
      [7, 7],
      [9, 7],   // morning rush holds 7-9
      [10, 3],
      [11, 7],
      [13, 7],  // midday rush holds 11-13
      [14, 3],
      [15, 7],
      [17, 7],  // afternoon rush holds 15-17
      [18, 3],
      [19, 8],
      [21, 8],  // evening rush holds 19-21, the day's hardest
      [22, 3],
    ] as [number, number][],
  },

  runway: {
    count: 3,                  // default; player picks 2/3/5 on the menu
    occupancySeconds: 8,       // how long a plane blocks the runway after touchdown
    takeoffSeconds: 6,         // runway occupancy for a departure roll
    holdShortOffsetPixels: 26, // departure wait point, offset from threshold
    lengthPixels: 150,
    widths: { small: 20, large: 28 }, // wide-body strips are visibly wider
    tapPaddingPixels: 14,      // extra hit-test margin
    // Vertical strips in a row immediately above the V-terminal: arrivals land
    // downward (threshold at top), departures roll upward away from the gates.
    // Ordered center-out so slice(0, n) works for the 2/3/5 runway setting:
    // the large center strip is always index 0, so wide-bodies always have a home.
    positions: [
      { x: 480, y: 330, angle: 90, size: 'large' },  // center, large
      { x: 580, y: 330, angle: 90, size: 'small' },
      { x: 380, y: 330, angle: 90, size: 'small' },
      { x: 680, y: 330, angle: 90, size: 'small' },
      { x: 280, y: 330, angle: 90, size: 'small' },
    ] as { x: number; y: number; angle: number; size: PlaneSize }[],
  },

  gate: {
    count: 10,                 // default; player picks 6/8/10/12 on the menu
    turnaroundSeconds: 30,     // time at gate before plane is ready to depart
    departWindowSeconds: 180,  // boarding countdown; past it the departure is delayed
    // V-shaped terminal: apex at bottom-center, arms rising outward.
    // Even gate ids fill the left arm, odd the right, expanding outward.
    apexX: 480,
    apexY: 572,
    armAngleDeg: 24,
    armStartOffset: 52,        // distance from apex to the innermost gates
    spacingPixels: 54,         // along-arm gap between gates
    sizePixels: 34,            // small gate box side length
    largeSizePixels: 44,
    largeEvery: 3,             // gate ids divisible by this are large
    tapPaddingPixels: 10,
  },

  approach: {
    // Holding circle center and radius, planes orbit here awaiting a runway.
    // Compact and high: the field below belongs to runways and the V-terminal.
    holdingCenterX: 480,
    holdingCenterY: 128,
    holdingRadiusBase: 48,
    holdingRadiusStep: 16,     // each additional plane expands radius by this
    orbitSpeedDegreesPerSecond: 26,
    spawnEdgeMarginPixels: 40, // spawn offset from screen edges
    fuelJitter: 15,            // max % of circling budget a flight arrives short
  },

  plane: {
    speedPixelsPerSecond: 80,
    landingSpeedPixelsPerSecond: 110,
    taxiSpeedPixelsPerSecond: 40,
    climbOutSpeedPixelsPerSecond: 140,
    // size classes: small goes anywhere; large needs large runways/gates
    sizes: {
      small: { fuelSeconds: 60, visualScale: 0.85 },  // circling budget
      large: { fuelSeconds: 120, visualScale: 1.25 },
    },
    initialFuel: 100,          // % of the size's circling budget
    initialPatience: 100,      // out of 100
    patienceDrainPerSecond: 0.3, // while waiting (holding, stuck, boarding)
    hitRadiusPixels: 26,
    // Visual size
    width: 28,
    height: 16,
  },

  nearMiss: {
    thresholdPixels: 30,
    cooldownSeconds: 5,        // min gap between near-misses for the same pair
    slowMoFactor: 0.2,         // time scale during slow-mo
    slowMoDurationMs: 1200,
  },

  events: {
    maxPerShift: 2,
    autoResolveSeconds: 8,     // dialog auto-picks option A after this (wall-clock)
    eventSlowMoFactor: 0.05,   // timeScale while the dialog is open
    riskLotterySize: 64,       // pre-rolled floats for go-around checks
    medical: {
      landWithinSeconds: 40,
      fuelDrainMult: 1, // the deadline is the pressure; extra drain would always game-over first
      divertPenaltyMult: 3,
      onTimeLandBonus: 200,
    },
    vip: {
      scoreMult: 3,
      patienceDrainMult: 2,
      ragePenaltyMult: 3,
    },
    defs: [
      {
        id: 'medical',
        name: 'MEDICAL EMERGENCY',
        description: 'A passenger is critical. The longest-circling flight must be on the ground in 45 seconds.',
        windowSeconds: [60, 180],
        onFire: [{ type: 'mark_plane', kind: 'medical' }],
        options: [
          {
            label: 'Priority clearance',
            description: 'Jump every queue. All other flights wait — patience drains 1.5x for 30s.',
            effects: [{ type: 'queue_jump' }, { type: 'patience_mult', mult: 1.5, durationSeconds: 30 }],
          },
          {
            label: 'Maintain sequence',
            description: 'No special treatment. Land it in time the hard way for the bonus — or eat a triple diversion.',
            effects: [],
          },
        ],
      },
      {
        id: 'fog',
        name: 'FOG BANK',
        description: 'Visibility is collapsing over the field for the next 45 seconds.',
        windowSeconds: [120, 240],
        options: [
          {
            label: 'Close runway 1',
            description: 'Half capacity, zero risk. The holding stack will grow.',
            effects: [{ type: 'close_runway', runwayId: 0, durationSeconds: 45 }],
          },
          {
            label: 'Low-visibility ops',
            description: 'Keep both runways open. Roughly one in three landings will go around.',
            effects: [{ type: 'go_around_risk', probability: 0.35, durationSeconds: 45 }],
          },
        ],
      },
      {
        id: 'bird_strike',
        name: 'BIRD STRIKE',
        description: 'A flock hit the next arrival on final. Its landing roll will take twice as long.',
        windowSeconds: [90, 210],
        onFire: [{ type: 'next_rollout_mult', mult: 2 }],
        options: [
          {
            label: 'Inspect runway',
            description: 'Close that runway 25s for a debris sweep. Safe, slow.',
            effects: [{ type: 'close_runway', runwayId: 'marked', durationSeconds: 25 }],
          },
          {
            label: 'Keep it moving',
            description: 'No inspection. Landings on that runway risk going around for 60s.',
            effects: [{ type: 'go_around_risk', probability: 0.25, durationSeconds: 60, runwayId: 'marked' }],
          },
        ],
      },
      {
        id: 'vip',
        name: 'VIP ARRIVAL',
        description: 'A government flight is inbound next. Triple points — and triple consequences.',
        windowSeconds: [150, 270],
        onFire: [{ type: 'mark_plane', kind: 'vip' }],
        options: [
          {
            label: 'Red carpet',
            description: 'VIP jumps the queue on arrival. Everyone else waits — patience 1.5x for 40s.',
            effects: [{ type: 'queue_jump' }, { type: 'patience_mult', mult: 1.5, durationSeconds: 40 }],
          },
          {
            label: 'No special treatment',
            description: 'The VIP waits like everyone else. Hope their patience holds.',
            effects: [],
          },
        ],
      },
    ] as GameEventDef[],
  },

  // Difficulty is a pure traffic dial; runway count is its own setting now.
  difficulty: {
    easy: { label: 'EASY', spawnRateMult: 0.8 },
    normal: { label: 'NORMAL', spawnRateMult: 1 },
    hard: { label: 'HARD', spawnRateMult: 1.15 },
  },

  perks: {
    draftSize: 3,
    defs: [
      {
        id: 'third_runway',
        name: 'Third Runway',
        description: 'Open runway 3. Throughput up, coordination load up.',
        repCost: 20,
        modifiers: { extraRunways: 1 },
      },
      {
        id: 'express_taxiway',
        name: 'Express Taxiway',
        description: 'Gate turnaround 30% faster.',
        repCost: 12,
        modifiers: { turnaroundMult: 0.7 },
      },
      {
        id: 'long_range_tanks',
        name: 'Long-Range Tanks',
        description: 'Holding planes burn fuel 40% slower.',
        repCost: 12,
        modifiers: { fuelDrainMult: 0.6 },
      },
      {
        id: 'weather_radar',
        name: 'Weather Radar',
        description: 'See the next event coming 60 seconds early.',
        repCost: 8,
        modifiers: { eventWarningSeconds: 60 },
      },
      {
        id: 'calm_cabins',
        name: 'Calm Cabins',
        description: 'Passenger patience drains 25% slower.',
        repCost: 10,
        modifiers: { patienceDrainMult: 0.75 },
      },
      {
        id: 'seventh_gate',
        name: 'Seventh Gate',
        description: 'One more gate at the terminal.',
        repCost: 10,
        modifiers: { extraGates: 1 },
      },
    ] as PerkDef[],
  },

  campaign: {
    shiftsPerRun: 5,
    archetypes: [
      {
        id: 'morning_rush',
        name: 'Morning Rush',
        description: 'A gentle start. Learn the field.',
        spawnRateMult: 0.85,
        eventCount: 1,
      },
      {
        id: 'storm_front',
        name: 'Storm Front',
        description: 'Weather is rolling in. Guaranteed fog.',
        spawnRateMult: 1,
        eventCount: 2,
        forcedEvents: ['fog'],
      },
      {
        id: 'vip_day',
        name: 'VIP Day',
        description: 'Government traffic. Reputation swings hit twice as hard.',
        spawnRateMult: 1,
        eventCount: 2,
        forcedEvents: ['vip'],
        repDeltaMult: 2,
      },
      {
        id: 'understaffed',
        name: 'Understaffed',
        description: 'Runway 2 crew called in sick. One strip all shift.',
        spawnRateMult: 0.8,
        eventCount: 2,
        closedRunways: [1],
      },
      {
        id: 'chaos',
        name: 'Chaos',
        description: 'Everything at once. Survive it.',
        spawnRateMult: 1.15,
        eventCount: 3,
      },
    ] as ShiftArchetype[],
  },

  juice: {
    masterVolume: 0.25,
    nearMissShakeIntensity: 3,
    nearMissShakeMs: 250,
    divertShakeIntensity: 8,
    divertShakeMs: 500,
    rageShakeIntensity: 5,
    rageShakeMs: 400,
  },

  satisfaction: {
    // scheduled arrival = spawnTime + this; prompt assignment lands on time,
    // extended circling goes late and drags A:00 down
    arrivalWindowSeconds: 75,
    weightArrivals: 0.4,
    weightDepartures: 0.6,   // D:00 is the airline-facing KPI, weighs more
    complaintPenalty: 5,     // % satisfaction lost per rage or diversion
  },

  scoring: {
    landingBase: 40,                 // landing pays small, scaled by patience
    departBase: 140,                 // departure pays big, scaled down by delay
    minLandingFraction: 0.2,         // payouts floor at this fraction
    onTimeBonus: 100,                // extra when the gate departure window is met
    onTimeThresholdSeconds: 0,       // D:00 — any overdue second counts as delayed
    lateMultiplierPerSecond: 0.005,  // departure payout reduction per second late
    overdueDripPerSecond: 2,         // score bleed while a boarding plane sits overdue
    ragePenalty: 150,                // patience hit zero (fires once per plane)
    nearMissBonus: 25,
    streakMultiplierStep: 0.1,       // each consecutive near-miss adds 0.1x
    collisionPenalty: 500,
    emergencyLandingPenalty: 200,
    diversionPenalty: 150,
  },

  reputation: {
    initial: 75,
    max: 100,
    min: 0,
    onTimeDelta: 2,
    delayThresholdSeconds: 30,  // delay beyond this triggers reputation drain
    delayDelta: -3,
    emergencyDelta: -10,
    collisionDelta: -25,
    diversionDelta: -8,
    // Below this threshold, airlines start cancelling routes
    collapseThreshold: 30,
    // Above this, premium airlines unlock
    premiumThreshold: 90,
  },

  ui: {
    fuelWarningThreshold: 30,
    patienceWarningThreshold: 25,
    hudFontSize: 12,
    hudPadding: 8,
  },
} as const;

export type Config = typeof CONFIG;

/** Shift seconds -> in-game clock hour (06:00 start, 22:00 end by default) */
export function clockHourAt(shiftTime: number): number {
  const { dayStartHour, dayEndHour, durationSeconds } = CONFIG.shift
  const hour = dayStartHour + (shiftTime / durationSeconds) * (dayEndHour - dayStartHour)
  return Math.min(hour, dayEndHour)
}

/** In-game clock hour -> shift seconds (inverse of clockHourAt) */
export function hourToShiftSeconds(hour: number): number {
  const { dayStartHour, dayEndHour, durationSeconds } = CONFIG.shift
  return ((hour - dayStartHour) / (dayEndHour - dayStartHour)) * durationSeconds
}

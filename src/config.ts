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

export const CONFIG = {
  canvas: {
    // Logical resolution — scaled to fill the viewport
    width: 390,
    height: 844,
    targetFps: 60,
  },

  shift: {
    durationSeconds: 300,
    // [timeSeconds, planesPerMinute] — piecewise linear spawn curve
    spawnCurve: [
      [0, 5],
      [60, 7],
      [120, 9],
      [180, 11],
      [240, 12],
      [300, 12],
    ] as [number, number][],
  },

  runway: {
    count: 2,
    occupancySeconds: 8,       // how long a plane blocks the runway after touchdown
    takeoffSeconds: 6,         // runway occupancy for a departure roll
    holdShortOffsetPixels: 26, // departure wait point, offset from threshold
    lengthPixels: 130,
    widthPixels: 22,
    tapPaddingPixels: 14,      // extra hit-test margin for fat fingers
    // runway positions in logical canvas coords [x, y, angleDegrees]
    positions: [
      { x: 130, y: 560, angle: -20 },
      { x: 260, y: 560, angle: 20 },
    ],
  },

  gate: {
    count: 6,
    turnaroundSeconds: 30,     // time at gate before plane is ready to depart
    terminalY: 730,            // gate row vertical position
    firstGateX: 50,            // x of gate 0; remaining gates spaced evenly
    spacingPixels: 58,
    sizePixels: 36,            // gate box side length
    tapPaddingPixels: 10,
  },

  approach: {
    // Holding circle center and radius, planes orbit here awaiting a runway
    holdingCenterX: 195,
    holdingCenterY: 220,
    holdingRadiusBase: 55,
    holdingRadiusStep: 22,     // each additional plane expands radius by this
    orbitSpeedDegreesPerSecond: 26,
    spawnEdgeMarginPixels: 30, // spawn offset from screen edges
    fuelJitter: 10,            // initial fuel varies +/- this amount
  },

  plane: {
    speedPixelsPerSecond: 80,
    landingSpeedPixelsPerSecond: 110,
    taxiSpeedPixelsPerSecond: 40,
    climbOutSpeedPixelsPerSecond: 140,
    initialFuel: 80,           // out of 100
    fuelDrainPerSecond: 0.4,   // while holding/approaching
    initialPatience: 100,      // out of 100
    patienceDrainPerSecond: 0.3, // while waiting (holding, stuck, boarding)
    scheduleSlackSeconds: 110, // deadline = spawnTime + this; delay measured from it
    hitRadiusPixels: 24,
    // Visual size
    width: 24,
    height: 14,
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
      landWithinSeconds: 45,
      fuelDrainMult: 3,
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

  juice: {
    masterVolume: 0.25,
    nearMissShakeIntensity: 3,
    nearMissShakeMs: 250,
    divertShakeIntensity: 8,
    divertShakeMs: 500,
    rageShakeIntensity: 5,
    rageShakeMs: 400,
  },

  scoring: {
    landingBase: 40,                 // landing pays small, scaled by patience
    departBase: 140,                 // departure pays big, scaled down by delay
    minLandingFraction: 0.2,         // payouts floor at this fraction
    onTimeBonus: 100,                // extra when delay <= onTimeThresholdSeconds
    onTimeThresholdSeconds: 20,
    lateMultiplierPerSecond: 0.005,  // departure payout reduction per second late
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

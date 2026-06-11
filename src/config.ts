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

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
      [0, 2],
      [60, 3],
      [120, 4],
      [180, 6],
      [240, 8],
      [300, 8],
    ] as [number, number][],
  },

  runway: {
    count: 2,
    occupancySeconds: 12,      // how long a plane blocks the runway after touchdown
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
    turnaroundSeconds: 45,     // time at gate before plane is ready to depart
  },

  approach: {
    // Holding circle center and radius, planes orbit here awaiting a runway
    holdingCenterX: 195,
    holdingCenterY: 220,
    holdingRadiusBase: 60,
    holdingRadiusStep: 30,     // each additional plane expands radius by this
    orbitSpeedDegreesPerSecond: 18,
    spawnEdgeMarginPixels: 30, // spawn offset from screen edges
    fuelJitter: 10,            // initial fuel varies +/- this amount
  },

  plane: {
    speedPixelsPerSecond: 80,
    landingSpeedPixelsPerSecond: 110,
    taxiSpeedPixelsPerSecond: 40,
    initialFuel: 80,           // out of 100
    fuelDrainPerSecond: 0.4,   // while holding/approaching
    initialPatience: 100,      // out of 100
    patienceDrainPerSecond: 0.3, // while holding
    hitRadiusPixels: 24,
    // Visual size
    width: 24,
    height: 14,
  },

  nearMiss: {
    thresholdPixels: 45,
    slowMoFactor: 0.2,         // time scale during slow-mo
    slowMoDurationMs: 1200,
    screenShakeIntensity: 6,
    screenShakeDurationMs: 400,
  },

  scoring: {
    landingBase: 100,                // base points per landing, scaled by patience
    minLandingFraction: 0.2,         // landing always pays at least this fraction
    onTimeBonus: 100,
    lateMultiplierPerSecond: 0.002,  // score multiplier reduction per second late
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

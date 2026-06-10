# Airport Game — Project Instructions for Claude

## Read First

Before writing any code, read `GDD.md`. Every feature should serve the vision in that document. If a proposed change contradicts the GDD, flag it and ask before implementing.

---

## Hard Rules

- **All tuning values live in `src/config.ts` and nowhere else.** Spawn rates, timing constants, thresholds, score multipliers, patience drain rates — if it's a number that affects game feel, it belongs in config. Never hardcode a magic number in game logic files.
- **Never call `Math.random()` directly.** All randomness goes through the seeded RNG in `src/utils/rng.ts`. This makes bugs reproducible by seed and enables the daily challenge feature.
- **Commit after every working feature.** Not after every file — after every feature that can be played. If the game is broken, don't commit.
- **Never refactor untouched systems.** If a task touches file A, don't clean up file B. Scope creep across files is how agents break working code. Fix only what you were asked to fix.
- **Canvas for game rendering, React for UI shell.** The game loop draws to a `<canvas>` element via `requestAnimationFrame`. React components are only for menus, HUD overlay, score screens, and event dialogs — not game entities.
- **Plan mode for anything touching the game loop.** Any change to entity state machines, spawn logic, scoring, or the cascade system requires a written plan before coding.

---

## Repository Structure

```
src/
  config.ts         -- ALL tuning constants. Organized by system.
  main.tsx          -- Entry point, React root
  game/
    loop.ts         -- requestAnimationFrame loop, canvas setup, orchestration only
    sim.ts          -- Per-tick simulation step (pure logic, no DOM — testable headless)
    state.ts        -- Top-level game state (shift, score, reputation), gameStore
    input.ts        -- Pointer handling, hit-testing (tap plane -> tap runway)
    render.ts       -- All canvas draw code
    entities/
      plane.ts      -- Plane entity + state machine
      runway.ts     -- Runway entity
      gate.ts       -- Gate entity
    systems/
      spawn.ts      -- Plane spawning, approach queue management
      collision.ts  -- Near-miss detection, collision checks
      cascade.ts    -- Delay propagation, patience drain, fuel drain
      events.ts     -- Event system, event definitions
      scoring.ts    -- Score calculation, reputation updates
  utils/
    rng.ts          -- Seeded RNG wrapper. Only source of randomness.
    timer.ts        -- Shift timer, per-entity timers
  ui/
    App.tsx         -- React root, mounts canvas + UI overlay
    HUD.tsx         -- In-shift overlays: fuel bars, patience meters, streak counter
    ScoreScreen.tsx -- Post-shift score display
    EventDialog.tsx -- Event choice modal
    Menu.tsx        -- Main menu, perk draft screen
  assets/           -- Sounds, sprites (phase 2+)
```

---

## config.ts Structure

All constants exported as a single `CONFIG` object with namespaced sections:

```typescript
export const CONFIG = {
  shift: {
    durationSeconds: 300,
    spawnCurve: [...],   // spawn rate over time, array of [timeSeconds, planesPerMinute]
  },
  runway: {
    occupancySeconds: 12,
    capacityCount: 2,
  },
  gate: {
    turnaroundSeconds: 45,
    capacityCount: 6,
  },
  plane: {
    fuelDrainPerSecond: 1,       // out of 100
    patienceDrainPerSecond: 0.5, // out of 100
    initialFuel: 80,
    initialPatience: 100,
  },
  scoring: {
    onTimeBonus: 100,
    lateMultiplier: 0.5,
    nearMissBonus: 25,
    collisionPenalty: 500,
    emergencyPenalty: 200,
  },
  nearMiss: {
    thresholdPixels: 40,
    slowMoDuration: 1200,  // ms
  },
  reputation: {
    initial: 75,
    onTimeDelta: 2,
    delayDelta: -3,
    emergencyDelta: -10,
    collisionDelta: -25,
  },
} as const;
```

---

## Seeded RNG Usage

```typescript
import { rng } from '../utils/rng';

// Wrong:
const x = Math.random() * 100;

// Right:
const x = rng.next() * 100;
```

Seed is set once at shift start from either the daily seed (ISO date string) or a random session seed (which is then stored so bugs are reproducible). When reporting a bug, always include the seed.

---

## Entity State Machines

State transitions must go through the entity's `transition(newState)` method, never by direct assignment to `state`. This ensures transition hooks fire (e.g., freeing a runway when a plane taxis away).

---

## Event System

Events are defined as data in `src/game/systems/events.ts`, not as logic branches. Structure:

```typescript
interface GameEvent {
  id: string;
  name: string;
  trigger: EventTrigger;
  options: EventOption[];
  durationSeconds: number;
}
```

Adding a new event = adding a new object to the events array. No new code paths.

---

## Testing

- Run tests before marking any task done: `bun test`
- Test the game loop systems in isolation (spawn, scoring, cascade) — not the canvas renderer
- When adding a system, add at minimum: one test for the happy path and one for the cascade failure case
- No mocking of the RNG — use a fixed seed in tests

---

## What Not to Do

- Don't add features not in the GDD without asking
- Don't optimize performance before there's a performance problem
- Don't add error boundaries or loading states for the game canvas — it either works or it crashes with a stack trace
- Don't use `useEffect` to drive game state — the game loop owns state, React reads it
- Don't introduce a new dependency without checking if the existing stack already covers it

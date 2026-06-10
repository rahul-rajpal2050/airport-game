# Project Context

## Overview
Mobile-first airport tower management game. Player assigns runway slots and gates to incoming planes under time pressure. Core experience: the controlled unraveling of a system — cascading delays, fuel warnings, near-misses, and the dopamine hit of barely pulling it off. Think Flight Control crossed with Papers Please anxiety.

## Tech Stack
- **Runtime**: Bun
- **Bundler**: Vite
- **Language**: TypeScript
- **Game rendering**: Plain Canvas API + requestAnimationFrame loop (no game engine)
- **UI shell**: React (menus, HUD, score screens, event dialogs only)
- **Testing**: Vitest
- **Storage**: localStorage for meta-progression; Supabase or Firebase for leaderboard (Phase 5)

## Directory Structure
```
src/
  config.ts         -- ALL tuning constants (spawn rates, timings, score values)
  main.tsx          -- Entry point, React root
  game/
    loop.ts         -- rAF orchestration, canvas setup, startShift/endShift
    sim.ts          -- Per-tick simulation step (pure, no DOM, headless-testable)
    state.ts        -- GameState, ShiftStats, gameStore (useSyncExternalStore)
    input.ts        -- Pointer -> logical coords, tap-tap assignment
    render.ts       -- All canvas drawing
    entities/
      plane.ts      -- Plane class, full state machine, per-state movement
      runway.ts     -- Runway class: queue, reserve, sequence(), hit-test
    systems/
      spawn.ts      -- Pre-rolled spawn schedule (determinism contract), rateAt
      scoring.ts    -- Frame-event consumption -> score + stats
  utils/
    rng.ts          -- Seeded RNG (Mulberry32; never Math.random())
  ui/
    App.tsx         -- React root: canvas + phase-driven overlays
    Menu.tsx        -- Start shift overlay
    ScoreScreen.tsx -- Post-shift stats + Play Again
    overlay.ts      -- Shared overlay/button styles

Phase 2+ additions per GDD: entities/gate.ts, systems/collision.ts,
systems/cascade.ts, systems/events.ts, ui/HUD.tsx, ui/EventDialog.tsx
```

## Key Files
- `GDD.md` — Game design doc. Core loop, failure states, five addictiveness levers, emotional arc. Read before every session.
- `CLAUDE.md` — Project conventions for Claude Code. Hard rules, structure, config contract.
- `src/config.ts` — Single source of truth for all tuning values.
- `src/utils/rng.ts` — Seeded RNG. Every random call goes through here.

## Architecture
- The **game loop** owns all game state. React components read from it but do not drive it.
- **Seeded RNG** from day one — seed = daily ISO date string for challenge mode, or stored session seed for campaign. Enables reproducible bugs and daily leaderboard fairness.
- **Entity state machines** for planes (approaching → holding → landing → taxiing → at_gate → boarding → taxiing_out → departed). Transitions go through a method, never direct assignment.
- **Event system** is data-driven: events are objects in an array, not code branches. Adding event #11 is a 20-line diff.
- **Config contract**: all numeric tuning in `src/config.ts` under a namespaced `CONFIG` object. Nothing else may define these values.

## Development Phases
- **Phase 0** (setup): Vite + TS + Canvas scaffold, GDD.md, CLAUDE.md, seeded RNG, config.ts skeleton
- **Phase 1** (week 1): Core loop — spawn, assign, land, gate, depart, score screen. Rectangles and circles only.
- **Phase 2** (week 2): Cascades + juice — turnaround, delay propagation, near-miss slow-mo, sound, screen shake
- **Phase 3** (week 3): Events system — medical emergency, fog, bird strike, VIP flight
- **Phase 4** (week 4): Roguelite meta — reputation currency, perk draft between shifts, localStorage persistence
- **Phase 5**: Daily challenge + leaderboard (seeded RNG + Supabase/Firebase)

## Architecture Notes (load-bearing decisions)
- **Determinism contract**: ALL RNG draws happen at shift start via `generateSchedule()` —
  the entire spawn schedule is pre-rolled from the seed before frame 1. No mid-shift RNG.
  Same seed = identical shift regardless of frame rate or player actions.
- **Frame event bus**: systems push `{type, plane}` events onto `state.events`; scoring
  consumes and clears each frame. Phase 2 juice (sound/shake/slow-mo) hooks the same events.
- **timeScale** multiplies dt in the loop — the mechanism for Phase 2 slow-mo and pause.
- **Runway pipeline**: one plane per runway from commit (landing) to roll-out (departed).
  Player enqueues; `runway.sequence()` auto-commits the queue head each frame.
- Plane state union includes Phase 2 gate states; only Phase 1 transitions are in ALLOWED.

## Recent Changes
[2026-06-10] Density retune after feel feedback: spawnCurve 5->12/min (was 2->8),
occupancy 12s->8s, tighter holding rings, faster orbit. ~44-54 planes/shift, first
contact <14s. Added dev console handle window.__game (DEV only) for feel-tuning.
[2026-06-10] Phase 1 complete: core loop playable — spawn, tap-tap assign, hold/orbit,
land, score screen with stats and replay. 22 tests passing (bun test).
[2026-06-10] Phase 0: Vite + TS scaffold, seeded RNG, config.ts, canvas loop shell
[2026-06-10] Created GDD.md, CLAUDE.md, CONTEXT.md — project setup

## Current State
- Phase 1 playable: planes spawn on pre-rolled schedule, fly to holding rings, orbit
  burning fuel/patience; tap plane -> tap runway enqueues; runways auto-sequence;
  landing rolls out over occupancySeconds; fuel exhaustion diverts (penalty);
  score screen shows landed/diverted/longest-hold stat + seed + Play Again
- Tests: 22 across spawn determinism, plane state machine, runway sequencing,
  scoring math, and full-shift headless integration (sim.ts)
- NOT YET a git repository — needs git init + initial commit
- Next: kill checkpoint (play 10 shifts, tune config.ts feel), then Phase 2 cascades
- Known tuning question: first plane arrives ~15-45s in (rate 2/min at t=0) — may feel
  slow; bump spawnCurve[0] if the opening drags

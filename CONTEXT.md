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
      plane.ts      -- Plane class, full lifecycle state machine, per-state movement
      runway.ts     -- Runway class: mixed arrival/departure FIFO, hold-short, hit-test
      gate.ts       -- Gate class: reserve/occupy/release, terminal layout
    systems/
      spawn.ts      -- Pre-rolled spawn schedule (determinism contract), rateAt
      collision.ts  -- Near-miss detection (pair cooldown, holding-pairs excluded)
      events.ts     -- Event engine: pre-rolled schedule, effect-primitive
                       interpreter, dialog lifecycle, risk lottery
      scoring.ts    -- Frame-event consumption -> score + stats + streak + kind mults
    juice/
      audio.ts      -- Synthesized Web Audio (thunk, whoosh, alarm, chime...)
      juice.ts      -- Loop-side event consumer: sounds + screen shake
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
[2026-06-11] Phase 3 complete: data-driven events system. Effect-primitive
interpreter; 4 launch events (medical, fog, bird strike, VIP); EventDialog with
8s auto-resolve under deep slow-mo; go-arounds via pre-rolled risk lottery;
closed-runway mechanics. 46 tests passing.
[2026-06-11] Phase 2 complete: gate pipeline (the cascade), near-miss/slow-mo/streak,
juice (synthesized audio, screen shake). 32 tests passing.
[2026-06-10] Density retune after feel feedback: spawnCurve 5->12/min, occupancy 8s.
Dev console handle window.__game (DEV only) for feel-tuning.
[2026-06-10] Phase 1: core loop playable. Phase 0: scaffold, seeded RNG, config.

## Current State
- Phase 2 playable: full lifecycle approach -> hold -> land -> roll -> taxi -> gate
  turnaround -> boarding -> taxi out -> hold short -> takeoff -> climb out.
  Gateless planes BLOCK their runway after rollout (flashing ring) — the cascade.
  Mixed FIFO runway queues; gates reserve from the air; patience rage (one-time
  penalty); departures pay big scaled by delay vs deadline; near-miss slow-mo +
  streak bonus; synthesized sounds (landing thunk, whoosh, alarm, chime, takeoff,
  buzz); screen shake on failures
- Perfect-play benchmark (auto-controller, seed 'integration-seed'): 33 landed,
  21 departed, 18 on-time, score 5920 — late shift saturates by design
- Events live: seeded schedule picks 2 of 4 events per shift; choices are real
  trade-offs applied through effect primitives (close_runway, patience/fuel mults,
  go_around_risk, mark_plane, queue_jump, next_rollout_mult, score_delta).
  Adding event #5 = one def in CONFIG.events.defs
- Tests: 46 across 6 files; determinism contract holds with events + risk lottery
  (same seed + same scripted choices = identical stats)
- Git: clean history, one commit per feature
- Next: Phase 4 roguelite meta (reputation currency, perk draft, localStorage)
- Deferred known issue: 10+ plane holding stacks orbit partially off-screen
  (outer ring radius exceeds canvas width)

# Project Context

## Overview
Laptop/desktop-first airport tower management game. Player assigns runway slots and gates to incoming planes under time pressure. Core experience: the controlled unraveling of a system — cascading delays, fuel warnings, near-misses, and the dopamine hit of barely pulling it off. Think Flight Control crossed with Papers Please anxiety.

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
    input.ts        -- Pointer -> logical coords -> iso hit-testing, tap-tap assignment
    render.ts       -- All canvas drawing (depth-sorted, iso-projected)
    iso.ts          -- Projection math: project/unprojectGround, height/bank smoothing.
                       World stays flat top-down x/y everywhere else — this is the
                       ONLY place that projects it onto screen.
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
- **World space vs screen space**: sim/entities/scoring/tests operate ONLY in flat
  top-down world x/y — this never changed, even after the iso visual pass. `iso.ts` is
  the sole projection boundary. Ground entities (runway/gate) hit-test by unprojecting
  the click back to world space and calling their existing `containsPoint(wx,wy)`.
  Planes hit-test in SCREEN space instead (project the plane, compare to the raw click)
  since they carry real altitude now. Depth sort key is world Y alone (see below —
  NOT x+y; that was the rejected diamond-shear approach).

## Recent Changes
[2026-07-16] 2.5D visual pass (GDD roadmap item 6, done): new `iso.ts` projects world
x/y onto screen as a TILTED ORTHOGRAPHIC view (screenX=wx*scaleX+originX,
screenY=wy*scaleY-height+originY) — deliberately NOT a diagonal-shear diamond
isometric. Tried the diamond version first; live-tested it and rejected it — the
world layout (V-terminal, runway row) is mirror-symmetric about a vertical world
axis, and a shear-based formula only preserves that symmetry if the map is laid
out around the shear's diagonals, which ours isn't. The diamond version rendered
the V's two arms lopsided (one nearly vertical, one nearly horizontal) — a real bug,
not a tuning issue. Pure per-axis scaling fixed it instantly and still delivers real
plane altitude (ground shadow separately projected at height 0, smooth glide-down/
climb-out via a render-only WeakMap easing cache), banking on turns (heading-delta
-> sprite squish), depth-sorted draw order (single list, sorted by world Y, covering
runways/terminal/gates/planes), and extruded "3D block" side-faces on runways/
terminal/gates. Sim, entities, scoring, and all 109 pre-existing tests are
completely untouched — this was purely `render.ts` + `input.ts` + new `iso.ts`.
Verified live: click-to-select (screen-space plane hit-test) and click-to-assign
(ground unprojection -> existing containsPoint) both confirmed working via real
dispatched pointer events through the actual input.ts handler, not just visually.
Known minor cosmetic seam: the two terminal-arm extrusions' side-faces overlap
slightly at the shared V apex (small dark chevron) — not fixed, flagged as polish.
[2026-07-14] Addictiveness pass: personal bests (NEW PERSONAL BEST / "N% short of
your best" on score screen, records.bestSatisfaction, recorder now runs for ALL
modes), daily-challenge day streak (menu + score screen), live "beat NN%" HUD
target fetched from today's board, COPY RESULT share card (emoji block + link,
clipboard with execCommand fallback), golden flight (1/shift, seeded, gold glow,
5x per on-time leg), on-time departure combo (+15%/step, 2x cap, breaks on late,
HUD + best-combo stat). 101 tests. Deployed.
[2026-06-12] Playtest round 2: pause (space/P/esc + button, freezes sim & timers);
first arrival in 3-6s (kills dead opening gap); audio overhaul (convolver reverb +
compressor master chain, detuned/filtered voices, browner LFO+waveshaper jet roar —
no more chiptune); fog "close one runway" now player-picks the strip (was hardcoded
to the only large runway = unavoidable game over); re-route escape valve (re-click a
selected airborne plane → sends to another airport, ops-score cost only, no
complaint). 93 tests. NOT deployed yet.
[2026-06-12] Player-facing batch: first-start tutorial offer (5 slides + HOW TO
PLAY reopen), layered realistic sounds (3s jet-spool takeoff, tire screech, radio
blips on spawn), rush-hour group arrivals (30% formation waves, rate-compensated,
deterministic), and Phase 5 scaffolding: Supabase leaderboard client (plain fetch),
DAILY CHALLENGE menu mode (dailySeed), score submission UI, write-only suggestion
box. Backend UI hidden until CONFIG.backend gets the project URL + anon key —
SQL in supabase-setup.sql. 90 tests passing. NO DEPLOYS without Rahul's say-so.
[2026-06-12] Satisfaction scoring: headline score is passenger satisfaction %
(weighted A:00/D:00 minus complaints). A:00 = landed within 75s of spawn. HUD
top-right shows satisfaction + ops score; center shows both KPIs; score screen
leads with SATISFACTION %. Points remain as ops score feeding campaign economy.
satisfactionOf() pure function in scoring.ts. 85 tests passing.
[2026-06-12] 24h clock (06:00-22:00 over the shift, replaces countdown), rush-hour
spawn waves authored in clock hours (four plateaus, evening hardest), day/night
palette keyframes with dawn/dusk lerp, runway edge lights after dark, apron dimming.
clockHourAt/hourToShiftSeconds helpers in config. 80 tests passing.
[2026-06-11] Vertical runway row above the terminal (arrivals land downward,
departures roll upward end->threshold, hold-short beside rollout end), RUNWAYS
menu setting 2/3/5 (center always large), difficulty now a pure traffic dial
(0.8/1/1.15). Refuelling visuals: translucent at gate, green->yellow glow when
boarding-ready. Fixed PLAY AGAIN bypassing settings. 77 tests passing.
[2026-06-11] Rahul's redesign phase 1: V-shaped terminal (apex bottom-center, gates
up both arms), gate count setting (6/8/10/12, default 10), plane size classes
(small 60s / large 120s circling budgets; large needs L runways/gates, warning on
mismatch), fuel countdown with GAME OVER on empty (replaces fuel diversions),
3-minute gate departure window with score drip when overdue, D:00 rate in HUD and
score screen. Spawn curve retuned capacity-aware (4->8/min). 76 tests passing.
Roadmap re-sequenced in GDD: refuelling visuals -> 24h clock + day/night ->
satisfaction scoring -> leaderboard -> isometric.
[2026-06-11] Post-feedback batch: event dialogs resolve independently of the rAF
loop (fixes frozen-dialog symptom); jet silhouettes + altitude shadows + gradient/
apron/vignette background; difficulty setting (easy 3 runways / normal 2 / hard 1,
spawn-rate scaled) and near-miss slow-mo toggle, both persisted. 68 tests passing.
[2026-06-11] Phase 4 complete: roguelite campaign. 5-shift runs with archetypes
(morning rush, storm front, VIP day, understaffed, chaos); reputation as currency;
6 perks drafted between shifts (cost rep, deterministic per-run drafts); versioned
localStorage persistence with Continue Run. Landscape 960x600 canvas for laptop.
63 tests passing.
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
- Campaign live: runSeed derives shift seeds (`${runSeed}-shift${i}`) so whole runs
  are deterministic/replayable — this is the hook Phase 5 daily runs will reuse.
  Campaign controller (src/game/meta/campaign.ts) registers via loop.onShiftEnd;
  the sim stays campaign-agnostic. Free Shift mode unchanged.
- Tests: 109 across 10 files (was 63 as of the events milestone; grew through the
  meta/leaderboard/addictiveness/iso passes); determinism contract holds throughout
- Git: clean history, one commit per feature; deployed to GitHub Pages after each
  verified batch (see reference_deployment memory for the live URL + redeploy steps)
- All six GDD roadmap build-order items are now ✅ (V-terminal/size classes/fuel →
  vertical runways/refuel visuals → 24h clock/day-night → satisfaction scoring →
  daily challenge/leaderboard/addictiveness loop → 2.5D visual pass). Remaining
  open threads: the terminal-apex extrusion seam (cosmetic), and a possible future
  full diamond-isometric map redesign if the tilted-orthographic look isn't enough
- Known artifact (harmless): jumping shiftTime via __game dumps all spawns in one
  tick and farms near-miss streaks — impossible in real play, ignore in dev tests

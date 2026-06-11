# Airport Game — Game Design Document

## Vision

An airport tower management game about the controlled unraveling of a system under pressure. Not a puzzle — a juggle. The fantasy is omniscient authority over a chaotic system; the emotional experience is the slow-dawning dread that you were never actually in control.

Think Flight Control's tap-to-route simplicity crossed with the cascade anxiety of Papers Please. Every shift should feel like a short story with a climax.

**The three pillars** (in priority order):
1. **Addictive** — the five levers below; a failed shift must trigger "one more run"
2. **Mind-engaging** — triage and sequencing decisions, never reflexes alone
3. **Social-competitive** — friends compare scores on identical seeded daily shifts

**Platform**: laptop/desktop first (landscape canvas, mouse). Mobile portrait is a
later adaptation, not the default.

**Build order**: mechanics complete first (roguelite meta, then daily challenge +
leaderboard), visual overhaul last — target is **2.5D isometric** (altitude
shadows, banking planes, depth-sorted terminal), not the placeholder top-down.

---

## Core Loop

```
Shift starts (5 minutes real-time)
  └── Planes appear on approach (spawn curve: slow → fast → frantic)
        └── Player assigns: runway slot + gate
              └── Plane lands → occupies runway (N seconds) → taxis to gate
                    └── Gate occupied → passengers board/deplane (T seconds)
                          └── Plane departs → runway slot frees
                                └── Metrics update: on-time %, fuel warnings, reputation
Shift ends → score screen → "play again" pull
```

The **primary resource** is attention, not money. Runway slots and gates are finite. Time is the pressure.

---

## Entities

| Entity | State Machine |
|--------|---------------|
| Plane | `approaching → holding → landing → taxiing → at_gate → boarding → taxiing_out → departed` |
| Runway | `free → occupied` |
| Gate | `free → occupied → turning_around` |
| Shift | `pre_shift → active → post_shift` |

---

## Failure States

Failure is never binary — it's a spiral. The game should feel like watching a controlled explosion in slow motion.

1. **Fuel exhaustion** — plane circles too long (fuel bar drains). Forced emergency landing anywhere or divert (big rep hit). Triggered by runway congestion.
2. **Runway collision** — two planes assigned the same slot simultaneously. Instant catastrophic event. Rare but dramatic.
3. **Gate overflow** — all gates full, landed plane sits on runway blocking others. Cascade trigger.
4. **Passenger patience zero** — per-flight timer. If a plane sits at gate too long or departs very late, passengers rage. Reputation drains. Not instant death — slow bleed.
5. **Reputation collapse** — reputation hits zero → airline pulls contract → shift ends early in disgrace.

The **core failure pattern** is always a cascade, not a single mistake: one late arrival → blocked gate → next plane holds → fuel warning → emergency → two runways now occupied → everything stacks up.

---

## Emotional Arc Per Shift

```
0:00 — 1:00   Calm. One or two planes. Player feels in control. Tutorial-paced if day 1.
1:00 — 3:00   Rhythm. Satisfying choreography. Near-miss streak building.
3:00 — 4:00   Pressure spike. Spawn rate jumps. First event fires if shift has one.
4:00 — 4:30   The crisis. Something almost breaks or does break. Player improvises.
4:30 — 5:00   Resolution or spiral. Either heroic recovery or watching it fall apart.
5:00          Score screen. One stat that stings or one stat that glows.
```

The key design constraint: **never let the player feel unlucky**. Every failure should be traceable to a decision they made, even if that decision was 90 seconds ago.

---

## The Five Addictiveness Levers

### 1. Near-Miss Dopamine
Two planes pass within a threshold distance (without collision) → slow-mo flash, streak counter increments, satisfying sound. The player who is barely surviving gets a reward loop that feels earned. Streak counter resets on any collision.

### 2. Cascade Depth
The runway → gate → departure chain means mistakes compound. A player who manages a cascade successfully feels genuinely skilled. This is the depth that separates it from a simple tap game.

### 3. The Score Screen Hook
One primary score (on-time departures), but the **one stat that stings**: worst delay time, number of planes that had to circle, lowest reputation moment. Name it. Make the player want to beat it specifically. "6 planes circled" is a target. "0 collisions, 3 near-misses" is a boast.

### 4. Events as Trade-Offs (not obstacles)
Events don't just add difficulty — they force a choice with a visible cost on both branches:
- Medical emergency: hold all traffic (delays compound) vs. clear one runway immediately (disrupts queue)
- VIP flight: bump a scheduled departure (rep hit with that airline) vs. scramble (near-miss risk)
- Fog: reduce runway capacity (longer holds) vs. risk lower-visibility landings (collision probability up)

The player should sometimes choose the worse outcome deliberately. That's agency.

### 5. Roguelite Perk Draft
Between shifts, draft one perk from three options. Perks change the strategy, not just the numbers. Each shift feels different. Examples:
- **Second Runway** — doubles throughput, adds coordination complexity
- **Weather Radar** — see fog/storm 60s before it hits
- **Express Taxiway** — gate turnaround 30% faster
- **Holding Pattern Extension** — planes can circle 50% longer before fuel warning
- **Priority Landing** — one plane per shift gets instant runway access

---

## Events System

Events are data-driven (defined in config, not hardcoded). Each event has:
- `id`, `name`, `description`
- `trigger`: time window or condition (e.g., after minute 2, or when reputation < 70)
- `options[]`: array of choices with `label`, `cost`, `effect`
- `durationSeconds`: how long the event condition persists

Events should fire at most once per shift unless the shift type specifies otherwise.

---

## Shift Structure

| Shift # | Archetype | Special Rule |
|---------|-----------|--------------|
| 1 | Morning rush | No events, gentle spawn curve. Teach the loop. |
| 2 | Storm incoming | Fog event guaranteed. Forces runway reduction decision. |
| 3 | VIP day | Two VIP flights. Rep consequences for delays are 2x. |
| 4 | Understaffed | One runway closed from start. |
| 5 | Chaos | Two events. Aggressive spawn curve from minute 1. |
| Daily | Seeded | Same seed for all players that day. Leaderboard. |

---

## Metrics and Score

**Per-shift score** = base points (on-time departures × multiplier) + streak bonus (near-misses) - penalties (delays, diversions, emergency landings)

**Reputation** (0–100, persists across shifts in campaign mode):
- Starts at 75
- Increases: on-time performance, zero incidents
- Decreases: delays over threshold, emergencies, collisions
- Below 30: airlines start withdrawing routes (harder shifts)
- Above 90: unlock premium airlines (higher stakes, higher reward)

**Currency**: Reputation points spent on perks in the draft. Forces trade-off between safety buffer and capability.

---

## Controls (Mobile-First)

- **Tap plane** → select it (info panel shows fuel, patience, destination gate)
- **Tap runway** → assign selected plane to that runway
- **Tap gate** → assign selected (landed) plane to that gate
- **Lines drawn automatically** — player assigns, not routes
- No drag-to-draw paths. Assignment is the interaction, not routing.

This is a deliberate simplification from Flight Control. The complexity lives in the sequencing decisions, not the motor skill.

---

## Art Direction

Placeholder phase is rectangles and circles. The target (post-mechanics overhaul):
- **2.5D isometric**: angled perspective, altitude shadows under airborne planes,
  planes banking into turns, depth-sorted terminal buildings, textured terrain
- Landscape composition for laptop screens (Mini Metro / Monument Valley polish tier)
- Color language: green = clear, yellow = caution, red = critical, blue = VIP
- Planes are distinct silhouettes (regional jet, widebody, cargo)
- Runways feel like runways — painted markings, edge lighting at night shifts
- Weather effects: fog overlay, rain particles, none of which require 3D

---

## Audio Direction

- Satisfying landing thunk (the one sound worth getting right in phase 1)
- Radio chatter snippets: "cleared to land", "holding at 3000", not full sentences
- Near-miss: brief silence → dopamine hit sound
- Cascade failure building: ambient frequency shifts up slightly
- Score screen: short jingle, different for personal best vs. average vs. disaster

---

## Daily Challenge

Seed = ISO date string (e.g., `"2026-06-10"`) fed to the seeded RNG. Same spawn sequence, same events, same gate availability for every player that day. Score submitted to leaderboard. This is the social hook that drives return visits.

---

## What This Game Is Not

- Not a simulation (no fuel calculations, no real ATC procedures)
- Not a city builder (no construction, no money management)
- Not a puzzle (no single correct solution per level)

It's a **skill game about managing attention under exponentially increasing pressure**, with enough systemic depth that two playthroughs of the same shift feel different based on early decisions.

# ROTATIONS — Technical Specification

**Feature:** Pre-game rotation planner for youth basketball coaches
**App:** Courtside IQ (Next.js basketball analytics platform)
**Target:** U12 VJBL, Melbourne
**Status:** Planned — not yet implemented

---

## 1. Overview

The rotation planner is a pre-game tool that lets coaches define player availability and constraints, then generates an optimised 8-slot rotation using a quarter-slot time model. In Phase 2 it incorporates Net PPP data to rank lineup combinations. The tool must be fast, transparent, and override-friendly — coaches set the rules, the system does the arithmetic.

---

## 2. Time Model

Games are divided into **8 slots** across 4 quarters:

| Slot | Quarter | Half | Approx minutes |
|------|---------|------|----------------|
| Q1A  | 1       | A    | 0–5            |
| Q1B  | 1       | B    | 5–10           |
| Q2A  | 2       | A    | 10–15          |
| Q2B  | 2       | B    | 15–20          |
| Q3A  | 3       | A    | 20–25          |
| Q3B  | 3       | B    | 25–30          |
| Q4A  | 4       | A    | 30–35          |
| Q4B  | 4       | B    | 35–40          |

- Each slot = 1 unit of playing time (~5 minutes)
- Each slot has exactly 5 players on court
- Total player-slots in a game = 8 × 5 = 40
- A player appearing in N slots accumulates N × 5 minutes

The quarter-slot model was chosen over minute-by-minute for three reasons: it matches how youth coaches naturally think about rotation patterns, it keeps the UI simple enough for a sideline tablet, and it keeps the constraint space tractable for a pure-TypeScript solver.

---

## 3. Player-Level Constraints

All constraints are set per player, per plan. No constraint has a global default that cannot be overridden.

| Constraint | Type | Behaviour |
|---|---|---|
| `is_starter` | boolean | Player must appear in Q1A |
| `is_closer` | boolean | Player must appear in Q4B |
| `min_minutes` | integer (multiples of 5) | Player must appear in at least N/5 slots |
| `must_play_every_quarter` | boolean | Player must appear in at least one slot in each of Q1, Q2, Q3, Q4 |
| `unavailable` | boolean | Player is excluded from all slots; treated as absent |

**Derived constraint:** `min_quarters` is the number of distinct quarters a player must appear in. `must_play_every_quarter = true` sets `min_quarters = 4`. This field is not stored separately — it is derived from `must_play_every_quarter` at solve time.

**Validation rules:**
- `min_minutes` must be a multiple of 5, between 5 and 40
- A player cannot be both `unavailable` and `is_starter` or `is_closer`
- A player with `must_play_every_quarter = true` needs `min_minutes >= 20` to be satisfiable — flag a warning if the coach sets a lower value

---

## 4. Team-Level Constraints

These apply to every 5-player lineup, regardless of slot.

### 4.1 Position Balance
Every valid 5-player lineup must contain:
- At least 1 player whose `primary_positions` or `secondary_positions` includes a perimeter position (`'PG'` or `'SG'`)
- At least 1 player whose `primary_positions` or `secondary_positions` includes an interior position (`'PF'` or `'C'`)

`'SF'` is position-neutral for balance purposes — a Small Forward alone does not satisfy either requirement. No hard requirement for all 5 positions to be represented. This constraint is **hard** — no lineup is accepted that fails it.

### 4.2 Staggered Substitutions
Between any two **consecutive** slots, at most 2 players may change. Consecutive slot pairs are:
```
Q1A→Q1B, Q1B→Q2A, Q2A→Q2B, Q2B→Q3A, Q3A→Q3B, Q3B→Q4A, Q4A→Q4B
```
This is a **hard** constraint. The solver will not accept a transition that changes 3 or more players simultaneously.

### 4.3 Sub-Call Minimisation
A "sub call" is any slot transition where at least 1 player changes. The solver minimises total sub calls across the game as a secondary objective (after satisfying all hard constraints). Target: ≤2 sub calls per quarter, which means ≤1 change within a quarter (Q_A → Q_B) and at most 1 change at the quarter break (Q_B → next quarter's Q_A).

Sub calls are **reported** in the output but not enforced as a hard limit — if constraints force more transitions, the solver proceeds and flags the count.

---

## 5. Algorithm Design

The optimiser is a pure TypeScript function in `app/rotations/optimiser.ts`. No external optimisation libraries. It runs client-side for instant feedback without a round-trip.

### 5.1 Phase 1 — Feasibility Check

Before attempting to build a rotation:

1. Count available players (all non-`unavailable` players)
2. Verify: `available_players × max_slots_per_player >= 40` (enough bodies to fill all slots)
   - Specifically: total available player-slots must be >= 40 after honouring `max_minutes` if any upper bounds are set
3. For each constrained player, verify their `min_minutes` can be satisfied given how many slots remain after locking starters/closers
4. Check that the available player pool can satisfy position balance in every slot (needs ≥1 perimeter player PG/SG and ≥1 interior player PF/C among non-unavailable players)

If any check fails, return immediately with:
```typescript
{
  feasible: false,
  reason: string,   // plain-language explanation for the coach
  slots: null,
  warnings: []
}
```

### 5.2 Phase 2 — Seeded Assignments

Lock the slots that are fully determined by hard constraints before the solver explores anything:

1. **Starters lock:** All `is_starter` players → forced into Q1A
2. **Closers lock:** All `is_closer` players → forced into Q4B
3. **Every-quarter lock:** For each `must_play_every_quarter` player, mark that at least one slot in each quarter must include them. Do not lock specific slots yet — just track the requirement.
4. Validate that Q1A starter list (≤5) and Q4B closer list (≤5) do not exceed 5 players each. If either list exceeds 5, report infeasibility.

### 5.3 Phase 3 — PPP-Weighted Fill (Phase 2 feature, optional in MVP)

When historical Net PPP data is available:

1. For each candidate 5-player lineup, compute a **lineup score**:
   - If the team has played ≥3 possessions with this exact lineup: use historical Net PPP for that lineup
   - Otherwise: use the mean of individual player Off PPP ratings from `lib/getSeasonAggregates.ts`
2. For each unlocked slot, enumerate all valid 5-player subsets of available players that:
   - Satisfy position balance
   - Are reachable from the previous slot within the stagger constraint (≤2 changes)
3. Assign the highest-scoring valid lineup to each slot in order (Q1A → Q4B), skipping locked slots

In MVP (Phase 1), this phase is skipped. All lineup scoring is omitted and the solver assigns players using only constraint satisfaction, filling slots greedily by `min_minutes` priority (players with highest minimums get scheduled first).

### 5.4 Phase 4 — Constraint Repair

After the greedy fill, check every player's actual slot count against their `min_minutes`:

```
For each player p where actual_slots < min_minutes / 5:
  Find slots where p is not present
  For each such slot (ordered by lowest lineup PPP score, or random in MVP):
    If swapping in p and removing the lowest-PPP player in that slot:
      - Does not break position balance
      - Does not violate stagger constraint with adjacent slots
    Then make the swap and break
  If no valid swap found, add to warnings[]
```

**Iteration cap:** 50 repair iterations before aborting with a partial solution. Partial solutions are valid outputs — the coach can adjust constraints and regenerate.

### 5.5 Phase 5 — Sub-Call Minimisation

After constraint repair, run a post-processing pass:

1. For each quarter, check if Q_A and Q_B have identical lineups. If yes, 0 sub calls for that quarter.
2. For any quarter where Q_A ≠ Q_B: attempt to find a lineup that satisfies both slots' constraints, reducing to 0 sub calls. If impossible (e.g. a player is `must_play_every_quarter` and the only way to get them in is via Q_B), accept the sub call.
3. Count total sub calls and include in output.

### 5.6 Solver Output

```typescript
interface RotationResult {
  feasible: boolean;
  reason?: string;                    // only if feasible = false
  slots: SlotAssignment[] | null;     // 8 items when feasible
  playerMinutes: PlayerMinuteSummary[];
  constraintReport: ConstraintReport[];
  estimatedPPP: SlotPPP[];           // empty in MVP Phase 1
  totalSubCalls: number;
  warnings: string[];                 // soft constraint violations
}

interface SlotAssignment {
  quarter: 1 | 2 | 3 | 4;
  slot: 'A' | 'B';
  playerIds: string[];               // exactly 5 UUIDs
}

interface PlayerMinuteSummary {
  playerId: string;
  slotsPlayed: number;
  minutesPlayed: number;             // slotsPlayed × 5
  quartersPlayed: number[];          // e.g. [1, 2, 3, 4]
}

interface ConstraintReport {
  playerId: string;
  constraint: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

interface SlotPPP {
  quarter: 1 | 2 | 3 | 4;
  slot: 'A' | 'B';
  estimatedNetPPP: number | null;
}
```

---

## 6. Database Schema Additions

### 6.1 Modify `players` Table

```sql
ALTER TABLE players
  ADD COLUMN primary_positionss TEXT[] DEFAULT '{}',
  ADD COLUMN secondary_positions TEXT[] DEFAULT '{}';
```

No migration needed for existing player rows — these columns are nullable and default to empty. Coaches populate them via the constraint table UI when first using the rotation planner.

### 6.2 New Tables

```sql
-- A named rotation plan, optionally linked to a specific game
CREATE TABLE rotation_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  game_id     UUID REFERENCES games(id),             -- nullable
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rotation_plans_team_id_idx ON rotation_plans(team_id);
CREATE INDEX rotation_plans_game_id_idx ON rotation_plans(game_id);

-- Per-player constraints for a specific plan
CREATE TABLE rotation_constraints (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                  UUID NOT NULL REFERENCES rotation_plans(id) ON DELETE CASCADE,
  player_id                UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  is_starter               BOOLEAN NOT NULL DEFAULT false,
  is_closer                BOOLEAN NOT NULL DEFAULT false,
  min_minutes              INTEGER NOT NULL DEFAULT 10
                             CHECK (min_minutes >= 0 AND min_minutes <= 40 AND min_minutes % 5 = 0),
  must_play_every_quarter  BOOLEAN NOT NULL DEFAULT false,
  unavailable              BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (plan_id, player_id)
);

-- The 8 slot assignments for a solved plan
CREATE TABLE rotation_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES rotation_plans(id) ON DELETE CASCADE,
  quarter         INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  slot            TEXT NOT NULL CHECK (slot IN ('A', 'B')),
  player_ids      UUID[] NOT NULL,              -- exactly 5 UUIDs
  estimated_ppp   NUMERIC(5,3),                 -- null in Phase 1 MVP
  UNIQUE (plan_id, quarter, slot)
);
```

**RLS policies:** All three tables should inherit the same row-level security pattern as existing tables — access scoped by `team_id` (via `rotation_plans`) using the organisation's auth context. Specific policy SQL omitted here; follow the pattern already applied to `player_game_stats`.

---

## 7. File Structure

```
app/
└── rotations/
    ├── page.tsx              # Server component
    │                         # Fetches: players, rotation_plans, season aggregates
    │                         # Passes data as props to RotationPlanner
    │
    ├── RotationPlanner.tsx   # Client component (primary interactive shell)
    │                         # Owns: constraint state, plan metadata, trigger for solver
    │                         # Renders: GameSetup, ConstraintTable, RotationGrid
    │
    ├── RotationGrid.tsx      # Client component (read-only visual output)
    │                         # Props: RotationResult, players[]
    │                         # Renders: 4×2 grid, minutes bars, sub-call summary,
    │                         #          constraint compliance badges
    │
    ├── optimiser.ts          # Pure TypeScript constraint solver
    │                         # Exports: solveRotation(input: OptimiserInput): RotationResult
    │                         # No imports from Next.js, React, or Supabase
    │                         # No side effects — deterministic given same input
    │
    └── types.ts              # Shared TypeScript types for rotation domain
                              # Re-exports nothing from lib/ — standalone domain types
```

### 7.1 `page.tsx` — Server Component Responsibilities

```typescript
// Fetches required for rotation planner:
// 1. players WHERE team_id = teamId AND deleted_at IS NULL
// 2. rotation_plans WHERE team_id = teamId (for plan selector)
// 3. Season aggregates via lib/getSeasonAggregates.ts (for PPP overlay in Phase 2)
// 4. Upcoming games WHERE team_id = teamId AND date >= today (for game link dropdown)
```

All fetching happens server-side. No Supabase calls in client components. The optimiser runs entirely on the data passed down as props.

### 7.2 `optimiser.ts` — Interface Contract

```typescript
interface OptimiserInput {
  players: PlayerWithPosition[];          // all available players for this team
  constraints: PlayerConstraint[];        // one entry per player (including unavailable)
  seasonAggregates?: SeasonAggregates;   // optional; enables PPP weighting
}

interface PlayerWithPosition {
  id: string;
  name: string;
  primaryPositions: Array<'PG' | 'SG' | 'SF' | 'PF' | 'C'>;   // position 1–5
  secondaryPositions: Array<'PG' | 'SG' | 'SF' | 'PF' | 'C'>;
}

interface PlayerConstraint {
  playerId: string;
  isStarter: boolean;
  isCloser: boolean;
  minMinutes: number;
  mustPlayEveryQuarter: boolean;
  unavailable: boolean;
}

// Main export
export function solveRotation(input: OptimiserInput): RotationResult
```

The optimiser must be importable in a Jest test with zero environment setup. No `process.env`, no fetch calls, no Supabase client.

---

## 8. UI Wireframe

```
/rotations
│
├── PLAN SELECTOR
│   ├── Dropdown: existing plans for this team
│   └── [+ New Plan] button → clears form, generates default name
│
├── GAME SETUP
│   ├── Plan name field (text input)
│   ├── Link to game (optional dropdown — upcoming games from DB)
│   └── Player availability
│       └── 10 player chips in a row
│           Green chip = available | Red chip = unavailable (click to toggle)
│           Toggling updates the unavailable constraint for that player
│
├── PLAYER CONSTRAINTS
│   └── Table with one row per available player:
│
│   #  | Name    | Position | Min Mins | Starter | Closer | Every Q
│   ---|---------|----------|----------|---------|--------|--------
│   38 | Cooper  | SF/PF    | 20       | [ ✓ ]   | [   ]  | [ ✓ ]
│   9  | Mitch   | PG       | 20       | [   ]   | [ ✓ ]  | [   ]
│   ...
│
│   Position column: dropdowns for primary position (sets players.primary_positions)
│   Min Mins: numeric input, steps of 5, range 5–40
│   Starter/Closer/Every Q: checkboxes
│   Unavailable players are greyed out and excluded from this table
│
├── [GENERATE ROTATION] button
│   └── Runs solveRotation() client-side; no server round-trip for the solve
│       Saves result to Supabase after solve completes
│
└── RESULT (rendered once a result is available)
    │
    ├── ROTATION GRID (4 rows × 2 cols)
    │   Each cell shows 5 player name chips
    │   Chip colour = position group (e.g. blue=PG/SG, green=SF, orange=PF/C)
    │   Locked slots (starters, closers) have a small padlock icon
    │   Cells with PPP estimates show a small badge (Phase 2)
    │
    │   Q1 | [Cooper Mitch Wade Raph Ethan] | [Cooper Mitch Wade Teddy Zach]
    │   Q2 | [Mitch Zac Raph Charlie Ethan] | [Cooper Zac Wade Raph Lenny]
    │   Q3 | [Mitch Zac Wade Raph Teddy]    | [Cooper Mitch Wade Charlie Zach]
    │   Q4 | [Mitch Zac Wade Raph Ethan]    | [Cooper Mitch Wade Raph Zach]
    │
    ├── SUB-CALL SUMMARY
    │   "Q1: 1 call | Q2: 1 call | Q3: 1 call | Q4: 1 call = 4 total"
    │   (zero calls shown in green, non-zero in amber)
    │
    ├── PLAYER MINUTES BAR
    │   Horizontal bar chart: one bar per player
    │   Bar width = minutes played, colour coded by constraint status
    │   Shows target minimum as a marker on the bar
    │   e.g. Cooper ████████████████░░░░ 25 min (min: 20 ✓)
    │
    ├── CONSTRAINT COMPLIANCE
    │   Badge row: ✓ Starters  ✓ Closers  ✓ Min minutes  ⚠ Position balance  ✓ Stagger
    │   Clicking a badge expands detail (which players, which slots)
    │
    ├── ESTIMATED NET PPP PER SLOT (Phase 2 only)
    │   Small number shown in each grid cell corner
    │   Grey/italic if derived from individual ratings rather than lineup history
    │
    └── [Adjust & Regenerate]
        Constraint table re-appears above the result (inline, not a new page)
        Editing any constraint and clicking [Regenerate] re-runs the solver
        Phase 2: shows revised grid side-by-side with original
```

---

## 9. Phased Delivery

### Phase 1 — MVP

Scope:
- Single page at `/rotations`
- Manual constraint entry (all fields in table above)
- Constraint-only solver (Phases 1–2 of algorithm, skip PPP weighting)
- Display rotation grid, minutes bars, sub-call count, constraint compliance badges
- Save plan + slots to Supabase
- Load existing plans from Supabase

Not in scope for Phase 1:
- PPP weighting or estimated PPP per slot
- Side-by-side comparison
- Multiple saved plans UI (data is saved, selector is basic)
- PDF export

Acceptance criteria:
- Given 10 players with varied constraints, solver returns a valid 8-slot rotation in <200ms
- All hard constraints (starter, closer, position balance, stagger) are satisfied or reported as infeasible
- Player minutes summary reflects actual slot assignments
- Plan is persisted to Supabase and reloadable

### Phase 2 — PPP Overlay

- Pull season aggregates from `lib/getSeasonAggregates.ts`
- Compute lineup scores as described in Algorithm Phase 3
- Show estimated Net PPP per slot in grid
- Side-by-side comparison: original plan vs. adjusted plan after constraint change
- Link rotation plan to specific upcoming game from games table

### Phase 3 — Saved Plans and Export

- Plan management: list, rename, duplicate, delete rotation plans
- Export rotation as printable PDF (simple grid layout, no styling overhead)
- Lineup PPP tracking: after a game, record which planned lineups were actually used and what the real Net PPP was
- Foundation for real-time game-day sub tracking mode (out of scope until later)

---

## 10. Key Implementation Notes

These notes are for the AI agent or developer implementing this feature.

**Solver purity.** `optimiser.ts` must be a pure module. It accepts plain data objects and returns a plain result. No Supabase client, no `fetch`, no React hooks. This makes it testable in isolation and runnable in a web worker if performance becomes an issue in Phase 2.

**Data flow.** All Supabase queries happen in `page.tsx` (server component). Player data, existing plans, and season aggregates flow down as props. The client components call `solveRotation()` locally. After solving, the client component calls a server action or API route to persist the result — it does not call Supabase directly from the component.

**Position data.** The `primary_positions` and `secondary_positions` columns are new. In the MVP, the coach sets these in the constraint table UI on first use. The solver treats an empty `primary_positions` array as satisfying neither perimeter nor interior — a player with no positions set cannot contribute to the balance constraint. Warn the coach before solving if any available player has no positions set.

**PPP data source.** Do not duplicate logic from `lib/getSeasonAggregates.ts`. Pass aggregates in as an optional parameter to `solveRotation()`. The solver reads from it; it does not compute it.

**No hardcoded IDs.** The solver, grid, and constraint table must all accept `teamId` as a parameter. Player IDs come from the database. No UUID literals anywhere in the rotations feature files.

**Stagger constraint detail.** The set difference between two consecutive slots is what counts. If Q1A = {A, B, C, D, E} and Q1B = {A, B, C, D, F}, that is 1 change (E out, F in) — valid. If Q1B = {A, B, C, F, G}, that is 2 changes — valid. If Q1B = {A, B, F, G, H}, that is 3 changes — invalid.

**Warnings vs. failures.** Hard constraints (position balance, stagger, starter/closer) cause `feasible: false` if they cannot be satisfied. Soft constraints (sub-call target, PPP optimality) produce entries in `warnings[]` but do not fail the solve. Min minutes that cannot be met after 50 repair iterations produce a `warn` in the constraint report, not a failure — partial solutions are better than no solution for a coach on game day.

**Saving plans.** When the coach clicks Save (or auto-save after generate), write:
1. `rotation_plans` row (upsert by id if editing existing plan)
2. `rotation_constraints` rows (delete + reinsert for that plan_id)
3. `rotation_slots` rows (delete + reinsert for that plan_id)

Do this in a transaction or sequential await chain. Do not leave orphaned slot rows if the plan save fails.

---

## 11. Out of Scope (this spec)

- Real-time in-game substitution tracking
- Integration with any external scheduling or stats platform
- Opponent-specific rotation adjustments (future: link to opponent scouting data)
- Automated rotation suggestions based on foul trouble (requires play-by-play events)
- Multi-team or multi-coach access controls (Phase 3 auth layer, not this feature)

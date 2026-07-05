# Native Stat Entry — Technical Spec (v1 / "Phase A")

**Status:** Draft — not yet built. Companion to `ROTATIONS.md` (same spec style). Read this + `memory.md` before starting implementation.

**Purpose:** let games be scored inside Courtside IQ from game video after the fact, instead of depending on a Hoopsalytics export + manual paste/parse. Upload stays available permanently as a parallel path (backfill, or any team/coach who prefers their existing workflow); this does not replace it.

**Confirmed: video-first, not live.** v1 targets post-game entry while watching video, not courtside real-time entry. This resolves the open question in §6 of the original draft and removes the offline-resilience problem from scope entirely — there's no time pressure and no live network dependency when the coach is reviewing on their own device after the game. Live in-game entry is a possible future extension of the same UI, not a v1 goal — revisit only if video-based entry proves too slow to keep up with the season's pace.

---

## 0. Read this first — why the design changed shape

The original framing (see project chat) was two phases: **Phase A** = simple box-score tally (fast, small build, no lineup tracking), **Phase B** = full event-level play-by-play + on-court lineup capture (the harder build, deferred).

A schema audit before writing this spec changed that. Querying real `player_game_stats` rows (game 32) confirmed `off_ppp`, `def_ppp`, `usage_pct`, `off_rtg`, `def_rtg`, `plus_minus`, and `vps` are **genuinely individualized per player** — not the team total copied onto every row:

| player | off_ppp | def_ppp | usage_pct | plus_minus | vps |
|---|---|---|---|---|---|
| Zac | 1.18 | 0.82 | 21.7 | +6 | 0.10 |
| Mitchell | 1.04 | 0.74 | 42.1 | +8 | 1.07 |
| Teddy | 1.03 | 0.72 | 6.5 | +10 | 1.83 |

These are on-court-derived stats — "team's rate while this player was on the floor" — which by definition cannot be produced from independent per-player tally counters. They require knowing, at every scoring event, who was on court. That's the definition of play-by-play.

**Consequence:** a pure box-tally tool (count 2PM, 2PA, OReb, etc. per player with no ordering) would ship with these fields permanently null for every natively-entered game — a visible regression on Trends (player mode reads `off_ppp`/`def_ppp` directly from the DB), Game Debrief top-contributor cards (shows +/-, VPS), and player profiles. Building that first and then rebuilding on an event-log model for "Phase B" means throwing the v1 work away.

**Decision:** build on the ordered event-log model from day one — the same `play_by_play` + `lineup_stints` schema and aggregation logic already proven by `scripts/import_pbp.mjs` against 4 real games. What used to be "Phase A vs B" is now **one system with a simplified v1 UI**: fewer event types exposed, no fine-grained video-clock sync, no behavioural tagging. Those are v2+ UI layers on the same foundation, not schema rework. Confirmed via grep that the other ~30 pre-computed columns on `player_game_stats` (`efg_pct`, `ts_pct`, `usage_pct`, `off_rtg`, `def_rtg`, `ast_pct`, `blk_pct`, `stl_pct`, `*_per_foul`, `def_2pt_pct`, `def_3pt_pct`, `def_to_pct`, `ns_fouls`, `off_pace`) are **not read anywhere in the app** — the app recomputes its own eFG%/TS%/TO% from raw counts. Those columns are Hoopsalytics-import leftovers; v1 can leave them null with zero product impact. `off_ppp`/`def_ppp`/`plus_minus`/`vps` are the only derived columns that matter, and only the first three are reproducible without reverse-engineering Hoopsalytics' proprietary VPS formula (flagged as an accepted gap below).

---

## 1. Scope

**In scope (v1):**
- Create a new game record in-app (currently doesn't exist — games only come from import scripts; `/games` can edit but not create). This is step one of the flow, not optional — there's no other way to get a game row to attach stats to.
- Select tonight's dressed roster.
- Log events for both teams while watching video after the game, via a simple button interface: made/missed 2PT, 3PT, FT, OReb, DReb, Ast, Stl, Blk, TO, fouls, and on-court substitutions. No in-app video embedding required — the coach watches on their own device/TV and taps along.
- Track running score + on-court lineup live.
- Finalize: aggregate the event log into `player_game_stats`, `team_game_stats`, `opponent_game_stats`, `games` (score/result), and `lineup_stints` — reusing the exact possession/PPP formulas already in `lib/driverTree.ts` and the exact lineup-reconstruction logic in `scripts/import_pbp.mjs`, so a natively-entered game is numerically indistinguishable from an imported one.
- Basic reconciliation before commit (tallied score matches entered final score; arithmetic checks per player) — same discipline as the existing importer's abort-on-mismatch gate.

**Explicitly out of scope for v1 (call out to Matt if any of these turn out to be blocking):**
- Coaching-behaviour tagging (closeouts, help rotations, etc.) — a separate, later layer once this event-log UI exists and proves out; the taxonomy for that is a design problem, not an engineering one, and shouldn't be conflated with getting basic native capture working.
- Frame-accurate video sync / embedded video player. "Post-game from video" mode just means the coach watches on their own device/TV and taps along in the app — no in-app video required for v1.
- Offline queuing for spotty gym wifi. This is a real risk for live in-game use (flagged in section 6) but is being deferred out of v1 to keep the first build shippable; upload stays available as the fallback if a live session is lost.
- Opponent player-level detail. Never tracked even in the Hoopsalytics data (opponent is bucketed as "Other") — v1 keeps that convention, opponent events attach to a single pseudo-actor, not individual opposing players.

---

## 1a. Video source — YouTube link(s), not upload

Confirmed: the video source is a YouTube link (stream or upload), not a file uploaded into the app. Games are sometimes one continuous YouTube video, sometimes split into 4 separate links (one per quarter) — both need to be supported.

**One small schema addition needed** (the only migration this feature requires): `games.video_urls text[]` — either 1 entry (whole-game video, used across all periods) or 4 entries (indexed to `period`). Nullable — games without video attached just skip this entirely.

**Embed, don't just link out.** `play_by_play` already has a `video_time` column, unused until now — it's a leftover from the Hoopsalytics CSV format, which also carried a "Video Time" field per row. That means this schema already anticipated video-linked timestamps; embedding the YouTube player directly in `/games/[id]/enter` (via the standard `youtube.com/embed/<id>` iframe) and reading the current playback position through YouTube's IFrame Player API on every event tap gets `video_time` populated automatically, for free, with no manual clock entry required as the primary time source. `clock_time` (game clock, e.g. "7:32") can stay an optional manual field for coaches who also want it, but it's no longer load-bearing.

When 4 links are used: changing the quarter selector swaps which video is loaded in the embed; `video_time` is only meaningful within whichever file is currently playing, and `period` (already on every event) disambiguates which file that was — no extra column needed for that.

**Practical caveats, not blockers:**
- The video must have embedding allowed (YouTube's default for normal uploads/streams, but worth confirming for whatever upload workflow produces these — a fully "private" video, as opposed to unlisted, will not embed).
- URL parsing needs to handle the handful of YouTube URL shapes that resolve to the same ID (`youtu.be/<id>`, `youtube.com/watch?v=<id>`, `youtube.com/live/<id>` for streams) — a small, well-understood parsing utility, not a design risk.
- A nice, low-cost follow-on this unlocks later: since every event now carries a real video timestamp, a future "jump to this play" link from a box score row or Game Debrief straight into the video becomes possible with no further schema work — worth keeping in mind even though it's out of scope for v1.

---

## 2. Data model — no new tables required

Every write target already exists and already has working RLS (verified live against the DB — `anon_insert_games`, `anon_insert_player_game_stats`, `Allow anon insert` on `team_game_stats`/`opponent_game_stats`, `anon_insert_opponents` are all already in place). This is a real advantage over most features built so far — no migration risk.

One gap: `player_game_stats`, `team_game_stats`, `opponent_game_stats` have INSERT + SELECT policies but **no UPDATE policy**. Editing a finalized game (correcting a mis-tap after the fact) should follow the existing precedent in `import_pbp.mjs` — **delete the game's rows and re-insert** — rather than adding new UPDATE policies. Simpler, and consistent with how PBP re-imports already work.

**Event log:** `play_by_play` — already has the right shape (`event_order`, `team_side`, `points`, `team_score`, `opp_score`, `clock_time`, `period`). v1 needs no schema change here. The existing `event_type` CHECK constraint vocabulary (`made_2pt, missed_2pt, made_3pt, missed_3pt, made_ft, missed_ft, oreb, dreb, assist, steal, block, turnover, def_foul, off_foul, foul, sub_in, sub_out`) already covers every v1 button.

**Lineup reconstruction:** `lineup_stints` — reuse as-is. The stint-building logic (walk the event log, open a new stint on each lineup change, close it on the next, sum PF/PA and derive Off/Def/Net PPP per stint) already exists in `scripts/import_pbp.mjs`. It should be **extracted into a shared function** (e.g. `lib/pbpAggregate.ts`) callable from both the importer and the new finalize action, rather than duplicated — avoids the two paths silently drifting apart.

**Box score aggregation:** derive `player_game_stats` raw counting fields by summing each player's events by type; derive `team_game_stats`/`opponent_game_stats` by summing `play_by_play` by `team_side`. Compute `off_ppp`/`def_ppp` per player the same way `lineup_stints` already does it per unit (points scored/allowed by the team while that player's stints were on court, divided by estimated possessions in that window) — this is the one piece of genuinely new logic, since the importer currently only computes PPP at the lineup-stint level, not rolled up to an individual player total across all their stints in a game. It's a straightforward sum-across-stints-containing-this-player operation, not a new formula.

**Accepted gap:** `vps` cannot be reproduced — it's a Hoopsalytics-proprietary metric and its formula isn't known. Leave it null for natively-entered games. This will make VPS-based displays (Game Debrief top contributors, some player-profile cards) blank for those games. Worth a quick pass later to either drop VPS from the UI when null, or define a Courtside IQ-owned replacement metric — not a v1 blocker, just needs a visible-not-broken treatment (same pattern already used for AI-credit outages: show an explicit "not available" state, never a silent zero).

**Formula reuse — one small prerequisite refactor:** `lib/driverTree.ts`'s `possessions(fga, fta, oreb, tov)` function is currently private to that module. Export it so the new finalize action imports the identical formula rather than re-implementing it — this is exactly the kind of drift the project has been bitten by before (Trends' zero-attempt bug, the dashboard Type-filter bug) — two implementations of the same math that quietly diverge.

---

## 3. UI flow

**`/games/new`** — game setup. Same fields `GamesSetupTable.tsx` already edits (date, opponent, home/away, round, venue, game_type) but wired to INSERT instead of UPDATE, plus one new field: paste 1 YouTube link (whole game) or 4 (one per quarter) into `video_urls`. Opponent picker includes "add new opponent" inline (name only — `opponents` INSERT policy already exists). On save, routes to the roster screen.

**`/games/[id]/roster`** — checkbox list of all 10 players, defaulting to all checked; uncheck anyone not dressed (mirrors the real "Cooper and Charlie didn't dress" case from game 32). Confirms the on-court starting 5 from the dressed set.

**`/games/[id]/enter`** — the core screen. Four zones:
0. **Video pane:** the embedded YouTube player for the current quarter's link (or the single game-long link). Changing the quarter selector swaps the loaded video when 4 links are configured.
1. **Header:** quarter selector (1–4), running score (our/opp, computed live from tallied makes), a "New Period" button that closes out the current stint cleanly (mirrors the "New Lineup" checkpoints the importer already validates against).
2. **On-court panel:** 5 chips for our current lineup + a bench strip. Tap a bench player then an on-court player to swap — logs `sub_out`/`sub_in` as an ordered pair, closes the current stint, opens a new one. This is the only interaction that requires care to get right; everything else is a flat button tap.
3. **Event buttons:** select a player (tap their chip), then tap an event (2PT Make/Miss, 3PT Make/Miss, FT Make/Miss, OReb, DReb, Ast, Stl, Blk, TO, Def Foul, Off Foul). A parallel, simpler "Opponent" actor strip has the same buttons for logging their events (no individual opposing players, matching the existing "Other" convention). Every tap writes one ordered `play_by_play`-shaped record to local state immediately, stamped with the YouTube player's current playback position (`video_time`) via the IFrame Player API — no network round-trip per tap.
4. **Undo:** a visible "undo last event" — coaches will mis-tap during a live possession, and there's no video to check against if it's a true live session. This is a real usability requirement, not a nice-to-have.

**`/games/[id]/finalize`** — review screen before committing. Shows the tallied final score next to a manually-entered "actual final score" field; if they don't match, block commit and surface the mismatch (same abort-on-mismatch discipline as `import_pbp.mjs`, applied at the UI layer instead of a script). On confirm, runs the aggregation server action and writes all five tables in one pass.

---

## 4. Server action

`app/games/[id]/actions.ts` (extend the existing file) — `finalizeNativeGame(gameId, events[])`:
1. Validate: per-player arithmetic (points = 2×2PM + 3×3PM + FTM, reb = oreb+dreb) — same checks used to validate the game 32 import.
2. Reconstruct lineup stints from the event log (shared `pbpAggregate.ts` function).
3. Compute possessions/PPP using the exported `possessions()` from `driverTree.ts`.
4. Write `play_by_play`, `lineup_stints`, `player_game_stats`, `team_game_stats`, `opponent_game_stats`, and update `games.team_score`/`opponent_score`/`result`.
5. **Verify affected-row counts on every insert, not just absence of an error** — this codebase has hit the silent-RLS-gap failure mode twice already (`games` UPDATE, `ai_content` grants). Treat it as a standing requirement for any new write path, not just games.

---

## 5. Build sequence

Roughly in this order, likely across several sessions given the size of this feature relative to anything shipped so far:

1. `pbpAggregate.ts` extraction — pull the stint-reconstruction + aggregation logic out of `import_pbp.mjs` into a shared lib module. Small, mechanical, de-risks everything after it, and immediately makes the existing importer more maintainable too.
2. Game creation + roster screen — small, reuses `GamesSetupTable`-adjacent patterns.
3. The live entry screen — on-court tracker + event buttons + running score. This is the largest single chunk.
4. Finalize/reconciliation screen + the `finalizeNativeGame` server action.
5. Undo + basic error recovery inside the entry screen.

**Not needed for v1:** offline resilience / live-entry hardening. Confirmed video-first — no time pressure, no live network dependency, a dropped connection just means retrying before hitting Finalize. Worth revisiting only if this tool is later extended to live courtside entry.

**One thing still worth doing even for video-only entry:** persist in-progress entry state to `localStorage` (not just React state) as events are tapped, so a browser refresh or accidental tab close mid-game doesn't lose 20+ minutes of tallying. Cheap to add, meaningfully reduces the annoyance of the one realistic failure mode that remains.

---

## 6. Open questions before build starts

- ~~Post-game video vs. live courtside~~ — resolved: video-first, not live (see §0).
- VPS — drop it from natively-entered games' UI, or worth defining a Courtside IQ-owned replacement metric now rather than later?
- Who reviews the video and does the tapping — Matt, an assistant coach, someone else? Doesn't change the build, but affects how forgiving the UI needs to be for a non-technical operator.

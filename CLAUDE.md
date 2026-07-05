@AGENTS.md

## Writing Standards

All AI-generated text within the application — coaching insights, driver summaries, player reports, recommendations, and any copy shown to coaches — must follow the writing standards in `reference_writing_standards.md` (project root).

Pay particular attention to:
- **Part 3 (Anti-AI Writing Rules)** — applies universally. No banned vocabulary, no negative parallelisms, no dead phrases, no metronome rhythm.
- **Tone** — clear, direct, practically grounded. Write like a knowledgeable basketball professional, not a stats algorithm. No hype language, no significance inflation, no hollow affirmations.
- **Format** — short paragraphs, varied sentence length, no mechanical transitions. State the fact; let the reader judge significance.

The coaching translation principle from the analytics framework reinforces this: every output should answer *"what basketball behaviours are driving this outcome?"* — not recite numbers.

## Project memory (read before continuing native-entry work)

The canonical, chronological project journal lives OUTSIDE this repo at
`/Users/mattb/AI Courtside IQ/memory.md`. Read it at the start of a session and
append a `## Session: <date>` entry at the end of a meaningful one. Workflow: Matt
commits/pushes from the Mac terminal (don't auto-commit); work stays on branch
`driver-tree-best-practice` (prod deploys from `main`). Supabase writes can silently
affect 0 rows on an RLS/grant gap — always verify affected-row counts.

## Native stat entry (in progress — built across 2026-07-05 sessions)

Video-first game scoring, in-app, as a parallel path to the Hoopsalytics importer.
Flow: `/games/new` → `/games/[id]/roster` → `/games/[id]/enter` (the capture screen)
→ `/games/[id]/finalize`. Core shared math is `lib/pbpAggregate.ts` (stint
reconstruction + box + per-player on-court PPP), reused by both `scripts/import_pbp.mjs`
and `finalizeNativeGame` in `app/games/[id]/actions.ts`; `possessions()` is exported
from `lib/driverTree.ts`. In-progress entry state is client-only in localStorage
(`lib/entryState.ts`) until finalize writes all five tables + games (delete-then-reinsert,
row-count verified). Migrations already applied to Supabase: `games.video_urls`,
anon DELETE on the stat tables + games, `play_by_play.shot_x/shot_y`.

**NEXT (not started):** the analytics phase — compute+store full Hoopsalytics-parity
stats validated against imported games 29–32, then a bespoke "CIQ Rating" value metric
(blended box + on-court, into a new column, replacing VPS), then a shot-chart display +
zone stats on the game page. Details and rationale are in the external memory.md above.

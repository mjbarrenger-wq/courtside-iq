-- Rotation Planner — persist full planner snapshot
-- Applied to Supabase 2026-06-24
--
-- The relational rotation_slots schema (8 fixed A/B slots, player_ids[5]) predates
-- the implemented optimiser, which uses configurable periods and per-minute sub
-- windows, and there is no relational home for GameConfig / team defaults / overrides.
-- Rather than force the evolved model into a stale schema, we persist the complete
-- planner snapshot as JSONB. This column is the source of truth for save/load.
--
-- rotation_constraints / rotation_slots remain in place but are currently unused by
-- the app (superseded by this snapshot). Candidates for cleanup or repurposing later.

ALTER TABLE rotation_plans ADD COLUMN IF NOT EXISTS state JSONB;

-- ============================================================
-- Migration: team profile fields, drill skill levels, game type
-- Run in Supabase SQL editor
-- ============================================================

-- ── 1. teams — additional profile fields ─────────────────────
-- age_group already exists. Add the remaining profile columns.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS gender        TEXT DEFAULT 'male'
    CHECK (gender IN ('male', 'female', 'mixed')),
  ADD COLUMN IF NOT EXISTS league        TEXT,
  ADD COLUMN IF NOT EXISTS division      TEXT,
  ADD COLUMN IF NOT EXISTS level         TEXT DEFAULT 'competitive'
    CHECK (level IN ('recreational', 'competitive', 'elite', 'professional')),
  ADD COLUMN IF NOT EXISTS head_coach    TEXT,
  ADD COLUMN IF NOT EXISTS home_venue    TEXT,
  ADD COLUMN IF NOT EXISTS season_format TEXT;

-- Populate WGT 12.2's profile
UPDATE teams SET
  gender        = 'male',
  league        = 'Basketball Victoria',
  division      = '12.2',
  level         = 'competitive',
  home_venue    = 'Whittlesea',
  season_format = 'Winter 2025-26'
WHERE id = 'b1000000-0000-0000-0000-000000000001';


-- ── 2. drills — skill level and age suitability ──────────────
-- skill_levels: who the drill suits regardless of age
--   beginner | intermediate | advanced | elite
-- age_suitability: broad age bracket
--   youth (8-12) | junior (13-17) | senior (18+) | masters (35+) | all

ALTER TABLE drills
  ADD COLUMN IF NOT EXISTS skill_levels    TEXT[] DEFAULT ARRAY['beginner','intermediate','advanced','elite'],
  ADD COLUMN IF NOT EXISTS age_suitability TEXT[] DEFAULT ARRAY['all'];

-- Backfill existing 80 drills with broad defaults
-- (difficulty → skill_levels mapping)
UPDATE drills SET skill_levels = ARRAY['beginner','intermediate']
  WHERE difficulty = 'foundation';

UPDATE drills SET skill_levels = ARRAY['intermediate','advanced']
  WHERE difficulty = 'developing';

UPDATE drills SET skill_levels = ARRAY['advanced','elite']
  WHERE difficulty = 'competitive';

-- All existing drills were authored for U12 but are structurally
-- suitable for youth and junior. Update to reflect that.
UPDATE drills SET age_suitability = ARRAY['youth','junior'];


-- ── 3. games — game type ─────────────────────────────────────
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_type TEXT DEFAULT 'regular_season'
    CHECK (game_type IN ('regular_season', 'playoff', 'practice', 'grading', 'tournament'));

-- Default all existing games to regular_season
UPDATE games SET game_type = 'regular_season' WHERE game_type IS NULL;

-- Games 30 and 31 (June 2026, round = null) are likely finals.
-- Update manually if confirmed:
-- UPDATE games SET game_type = 'playoff'
--   WHERE id IN (
--     'e1000000-0000-0000-0000-000000000030',
--     'e1000000-0000-0000-0000-000000000031'
--   );

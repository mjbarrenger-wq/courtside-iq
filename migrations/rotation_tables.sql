-- Rotation Planner Tables
-- Run in Supabase SQL Editor before building the rotation feature
-- See ROTATIONS.md for full schema rationale

-- ============================================================
-- rotation_plans
-- A named rotation plan for a team, optionally tied to a game
-- ============================================================
CREATE TABLE IF NOT EXISTS rotation_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  game_id     UUID REFERENCES games(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- rotation_constraints
-- Per-player constraints for a given rotation plan
-- ============================================================
CREATE TABLE IF NOT EXISTS rotation_constraints (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                 UUID NOT NULL REFERENCES rotation_plans(id) ON DELETE CASCADE,
  player_id               UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  is_starter              BOOLEAN NOT NULL DEFAULT false,   -- must be on court Q1 Slot A
  is_closer               BOOLEAN NOT NULL DEFAULT false,   -- must be on court Q4 Slot B
  min_minutes             INTEGER NOT NULL DEFAULT 10,      -- minimum total game minutes
  max_minutes             INTEGER NOT NULL DEFAULT 40,      -- maximum total game minutes
  must_play_every_quarter BOOLEAN NOT NULL DEFAULT false,   -- must appear in at least one slot per quarter
  unavailable             BOOLEAN NOT NULL DEFAULT false,   -- injured/absent — exclude entirely
  UNIQUE (plan_id, player_id)
);

-- ============================================================
-- rotation_slots
-- 8 slot assignments per plan: Q1A, Q1B, Q2A, Q2B, Q3A, Q3B, Q4A, Q4B
-- Each slot holds exactly 5 player UUIDs
-- estimated_ppp is optional — populated by PPP-weighted optimiser (Phase 2)
-- ============================================================
CREATE TABLE IF NOT EXISTS rotation_slots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        UUID NOT NULL REFERENCES rotation_plans(id) ON DELETE CASCADE,
  quarter        INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  slot           TEXT NOT NULL CHECK (slot IN ('A', 'B')),
  player_ids     UUID[] NOT NULL,                           -- exactly 5 elements
  estimated_ppp  NUMERIC(5,3),
  UNIQUE (plan_id, quarter, slot)
);

-- ============================================================
-- updated_at trigger for rotation_plans
-- ============================================================
CREATE OR REPLACE FUNCTION update_rotation_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rotation_plans_updated_at ON rotation_plans;
CREATE TRIGGER trg_rotation_plans_updated_at
  BEFORE UPDATE ON rotation_plans
  FOR EACH ROW EXECUTE FUNCTION update_rotation_plans_updated_at();

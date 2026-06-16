-- Migration: Update player positions to full 5-position taxonomy
-- Columns already exist from add_player_positions.sql
-- Run this in Supabase SQL Editor

-- Position reference:
--   PG = 1 (Point Guard)    — primary ball handler, sets offence
--   SG = 2 (Shooting Guard) — perimeter scorer, off-ball
--   SF = 3 (Small Forward)  — versatile wing, can guard multiple positions
--   PF = 4 (Power Forward)  — interior, rebounding + short-range scoring
--   C  = 5 (Centre)         — paint anchor, shot blocking, rim finishing

-- Clear old values first (were Guard/Forward/Centre from previous migration)
UPDATE players
SET primary_positions = '{}', secondary_positions = '{}'
WHERE id::text LIKE 'c1000000%';

-- Seed WGT 12.2 — VERIFY THESE BEFORE RUNNING
-- primary_positions:   positions the player is comfortable being asked to fill
-- secondary_positions: positions they can cover if needed, not preferred

UPDATE players SET
  primary_positions    = '{PG}',
  secondary_positions  = '{SG}'
WHERE id = 'c1000000-0000-0000-0000-000000000002';  -- Mitch #9

UPDATE players SET
  primary_positions    = '{SG, SF}',
  secondary_positions  = '{PG}'
WHERE id = 'c1000000-0000-0000-0000-000000000003';  -- Zac #6

UPDATE players SET
  primary_positions    = '{PG, SG}',
  secondary_positions  = '{SF}'
WHERE id = 'c1000000-0000-0000-0000-000000000004';  -- Wade #18

UPDATE players SET
  primary_positions    = '{SG}',
  secondary_positions  = '{SF}'
WHERE id = 'c1000000-0000-0000-0000-000000000005';  -- Raph #24

UPDATE players SET
  primary_positions    = '{SF}',
  secondary_positions  = '{SG, PF}'
WHERE id = 'c1000000-0000-0000-0000-000000000006';  -- Charlie #26

UPDATE players SET
  primary_positions    = '{PF, C}',
  secondary_positions  = '{SF}'
WHERE id = 'c1000000-0000-0000-0000-000000000007';  -- Lenny #50

UPDATE players SET
  primary_positions    = '{PF, C}',
  secondary_positions  = '{SF}'
WHERE id = 'c1000000-0000-0000-0000-000000000008';  -- Ethan #55

UPDATE players SET
  primary_positions    = '{SG, SF}',
  secondary_positions  = '{PG}'
WHERE id = 'c1000000-0000-0000-0000-000000000009';  -- Teddy #64

UPDATE players SET
  primary_positions    = '{PG, SG}',
  secondary_positions  = '{}'
WHERE id = 'c1000000-0000-0000-0000-000000000010';  -- Zach #79

UPDATE players SET
  primary_positions    = '{SF, PF}',
  secondary_positions  = '{SG}'
WHERE id = 'c1000000-0000-0000-0000-000000000001';  -- Cooper #38

-- Verify
SELECT jersey_number, first_name, last_name, primary_positions, secondary_positions
FROM players
WHERE id::text LIKE 'c1000000%'
ORDER BY jersey_number;

-- Migration: Add player positions to players table
-- Run this in Supabase SQL Editor

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS primary_positions TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS secondary_positions TEXT[] DEFAULT '{}';

-- Optional: add a check constraint to keep values clean
-- ALTER TABLE players ADD CONSTRAINT valid_positions
--   CHECK (primary_positions <@ ARRAY['Guard','Forward','Centre']::TEXT[]
--      AND secondary_positions <@ ARRAY['Guard','Forward','Centre']::TEXT[]);

-- Seed WGT 12.2 positions based on known player profiles
-- Guards: playmakers, perimeter scorers
-- Forwards: versatile, can handle/rebound
-- Centre: interior, rebounding focus

-- Seed WGT 12.2 positions — verify these before running
-- primary_positions: equally comfortable, preferred role
-- secondary_positions: can play if needed, not preferred

UPDATE players SET primary_positions = '{Guard}',          secondary_positions = '{}'         WHERE id = 'c1000000-0000-0000-0000-000000000002';  -- Mitch #9
UPDATE players SET primary_positions = '{Guard,Forward}',  secondary_positions = '{}'         WHERE id = 'c1000000-0000-0000-0000-000000000003';  -- Zac #6
UPDATE players SET primary_positions = '{Guard,Forward}',  secondary_positions = '{}'         WHERE id = 'c1000000-0000-0000-0000-000000000004';  -- Wade #18
UPDATE players SET primary_positions = '{Guard}',          secondary_positions = '{Forward}'  WHERE id = 'c1000000-0000-0000-0000-000000000005';  -- Raph #24
UPDATE players SET primary_positions = '{Forward}',        secondary_positions = '{Guard}'    WHERE id = 'c1000000-0000-0000-0000-000000000006';  -- Charlie #26
UPDATE players SET primary_positions = '{Centre,Forward}', secondary_positions = '{}'         WHERE id = 'c1000000-0000-0000-0000-000000000007';  -- Lenny #50
UPDATE players SET primary_positions = '{Forward,Centre}', secondary_positions = '{}'         WHERE id = 'c1000000-0000-0000-0000-000000000008';  -- Ethan #55
UPDATE players SET primary_positions = '{Guard,Forward}',  secondary_positions = '{}'         WHERE id = 'c1000000-0000-0000-0000-000000000009';  -- Teddy #64
UPDATE players SET primary_positions = '{Guard}',          secondary_positions = '{}'         WHERE id = 'c1000000-0000-0000-0000-000000000010';  -- Zach #79
UPDATE players SET primary_positions = '{Forward}',        secondary_positions = '{Guard}'    WHERE id = 'c1000000-0000-0000-0000-000000000001';  -- Cooper #38

-- Verify
SELECT jersey_number, first_name, last_name, primary_positions, secondary_positions
FROM players
WHERE id::text LIKE 'c1000000%'
ORDER BY jersey_number;

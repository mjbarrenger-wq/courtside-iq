-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- before running import_opponent_stats.js

CREATE TABLE IF NOT EXISTS opponent_game_stats (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id      uuid REFERENCES games(id) ON DELETE CASCADE,
  team_id      uuid REFERENCES teams(id),

  -- Scoring
  opp_pts          integer,

  -- Shooting
  opp_twopt_made   integer,
  opp_twopt_att    integer,
  opp_threept_made integer,
  opp_threept_att  integer,
  opp_ft_made      integer,
  opp_ft_att       integer,

  -- Possessions & ball control
  opp_possessions  numeric,
  opp_turnovers    integer,
  opp_off_fouls    integer,
  opp_def_fouls    integer,

  -- Rebounding
  opp_oreb         integer,
  opp_dreb         integer,

  -- Defensive activity
  opp_ast          integer,
  opp_stl          integer,
  opp_blk          integer,

  -- Hoopsalytics computed metrics (for reference)
  opp_off_ppp      numeric,
  opp_def_ppp      numeric,

  created_at       timestamptz DEFAULT now(),

  -- One opponent row per game
  CONSTRAINT uq_opponent_game UNIQUE (game_id)
);

-- Enable Row Level Security (match other tables)
ALTER TABLE opponent_game_stats ENABLE ROW LEVEL SECURITY;

-- Allow anon reads (same as other tables)
CREATE POLICY "Allow anon read" ON opponent_game_stats
  FOR SELECT USING (true);

-- Allow anon inserts (needed for the import script)
CREATE POLICY "Allow anon insert" ON opponent_game_stats
  FOR INSERT WITH CHECK (true);

-- Allow anon updates (needed for upserts)
CREATE POLICY "Allow anon update" ON opponent_game_stats
  FOR UPDATE USING (true);

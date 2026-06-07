-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- before running populate_team_game_stats.js

CREATE TABLE IF NOT EXISTS team_game_stats (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id      uuid REFERENCES games(id) ON DELETE CASCADE,
  team_id      uuid REFERENCES teams(id),

  -- Scoring
  pts              integer,

  -- Shooting
  twopt_made       integer,
  twopt_att        integer,
  threept_made     integer,
  threept_att      integer,
  ft_made          integer,
  ft_att           integer,

  -- Computed shooting metrics (from aggregated shot data)
  efg_pct          numeric,   -- (2pm + 1.5*3pm) / (2pa + 3pa)
  ts_pct           numeric,   -- pts / (2 * (fga + 0.44*fta))

  -- Rebounding
  oreb             integer,
  dreb             integer,
  reb              integer,

  -- Ball control
  turnovers        integer,
  ast              integer,

  -- Defensive activity
  stl              integer,
  blk              integer,

  -- Fouls
  fouls            integer,
  off_fouls        integer,
  def_fouls        integer,

  -- Possessions & efficiency (sourced from opponent_game_stats where available)
  -- opp_def_ppp = this team's off_ppp; opp_off_ppp = this team's def_ppp
  possessions      numeric,
  off_ppp          numeric,
  def_ppp          numeric,
  net_ppp          numeric,

  created_at       timestamptz DEFAULT now(),

  CONSTRAINT uq_team_game UNIQUE (game_id, team_id)
);

ALTER TABLE team_game_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read" ON team_game_stats
  FOR SELECT USING (true);

CREATE POLICY "Allow anon insert" ON team_game_stats
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon update" ON team_game_stats
  FOR UPDATE USING (true);

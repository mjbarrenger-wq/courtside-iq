-- Per-opponent-player box score for natively-scored games. Opponent events in
-- play_by_play already carry jersey_number (player_id stays null for the opponent);
-- finalizeNativeGame aggregates them by jersey into this table via
-- aggregateOpponentByJersey. jersey_number null = the team-level / unnumbered
-- ("Other") bucket. The team-level aggregate still lives in opponent_game_stats.
create table if not exists opponent_player_game_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id),
  jersey_number integer,
  points integer default 0,
  twopt_made integer default 0, twopt_att integer default 0,
  threept_made integer default 0, threept_att integer default 0,
  ft_made integer default 0, ft_att integer default 0,
  oreb integer default 0, dreb integer default 0, reb integer default 0,
  ast integer default 0, stl integer default 0, blk integer default 0,
  turnovers integer default 0, fouls integer default 0,
  created_at timestamptz default now()
);

alter table opponent_player_game_stats enable row level security;
grant select, insert, update, delete on opponent_player_game_stats to anon, authenticated;
create policy anon_all_opp_player_stats on opponent_player_game_stats
  for all to anon, authenticated using (true) with check (true);

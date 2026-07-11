-- Cascade the game_id foreign keys so deleting a game automatically removes its
-- child rows (box score, stints, play-by-play, opponent stats). Previously these
-- were NO ACTION and the app deleted each child table one-by-one, which silently
-- broke game-delete whenever a new child table (e.g. opponent_player_game_stats)
-- was added but not added to that list.
--
-- rotation_plans is intentionally left ON DELETE SET NULL — a saved rotation plan
-- should outlive the game it was drafted for. opponent_game_stats and
-- team_game_stats were already CASCADE.
--
-- Convention going forward: any new table with a game_id FK should be created
-- `references games(id) on delete cascade`.
alter table lineup_stints drop constraint lineup_stints_game_id_fkey,
  add constraint lineup_stints_game_id_fkey foreign key (game_id) references games(id) on delete cascade;
alter table play_by_play drop constraint play_by_play_game_id_fkey,
  add constraint play_by_play_game_id_fkey foreign key (game_id) references games(id) on delete cascade;
alter table player_game_stats drop constraint player_game_stats_game_id_fkey,
  add constraint player_game_stats_game_id_fkey foreign key (game_id) references games(id) on delete cascade;
alter table opponent_player_game_stats drop constraint opponent_player_game_stats_game_id_fkey,
  add constraint opponent_player_game_stats_game_id_fkey foreign key (game_id) references games(id) on delete cascade;

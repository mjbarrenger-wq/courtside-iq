-- Opponent minutes-on-court, per jersey. finalizeNativeGame fills this via
-- opponentSecondsByJersey (lib/pbpAggregate) from the opponent starting five plus
-- opponent sub_in / sub_out events. Null for the team-level ("Other") bucket and for
-- any jersey never placed on court, and for games where opponent minutes weren't
-- tracked at all — the box score is unaffected either way.
alter table opponent_player_game_stats
  add column if not exists time_played_seconds integer;

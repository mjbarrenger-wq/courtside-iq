-- Migration: allow anon DELETE on the game-stat write targets (native finalize)
-- Run this in Supabase SQL Editor.
--
-- finalizeNativeGame (and re-finalizing an edited game) follows the importer's
-- delete-then-reinsert pattern. An audit before building it found that anon could
-- NOT actually delete from these tables — RLS was enabled with only INSERT/SELECT
-- policies and no DELETE grant, so `DELETE FROM play_by_play WHERE game_id=…`
-- silently affected zero rows. import_pbp.mjs only ever appeared to work because
-- each game was imported exactly once; a re-import would have duplicated rows.
-- This is the same silent-RLS-gap class that has bitten the project before, so we
-- close it explicitly rather than adding UPDATE policies.
--
-- lineup_stints already has an ALL policy + grant, so it is not listed here.
-- games is never deleted (it is UPDATEd on finalize), so it is not listed either.

-- play_by_play
grant delete on play_by_play to anon, authenticated;
create policy anon_delete_play_by_play on play_by_play
  for delete to anon, authenticated using (true);

-- player_game_stats
grant delete on player_game_stats to anon, authenticated;
create policy anon_delete_player_game_stats on player_game_stats
  for delete to anon, authenticated using (true);

-- team_game_stats
grant delete on team_game_stats to anon, authenticated;
create policy "Allow anon delete" on team_game_stats
  for delete to public using (true);

-- opponent_game_stats
grant delete on opponent_game_stats to anon, authenticated;
create policy "Allow anon delete" on opponent_game_stats
  for delete to public using (true);

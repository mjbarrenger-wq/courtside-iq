-- Migration: allow anon DELETE on games (Game Config "delete game" button)
-- Run this in Supabase SQL Editor.
--
-- Deleting a duplicate/unwanted game from /games needs anon DELETE on the games
-- row itself. Child rows (play_by_play, lineup_stints, *_game_stats, ai_content)
-- are already anon-deletable and are removed first by the deleteGame server action.
-- Same permissive posture as the other anon write policies on this single-team app.

grant delete on games to anon, authenticated;
create policy anon_delete_games on games
  for delete to anon, authenticated using (true);

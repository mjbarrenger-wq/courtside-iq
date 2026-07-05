-- Migration: Add video_urls to games table (native stat entry, STAT_ENTRY.md §1a)
-- Run this in Supabase SQL Editor.
--
-- Native game scoring is video-first: the coach watches game video on YouTube and
-- taps events along with it. A game is either one continuous YouTube video or four
-- separate links (one per quarter). This column holds those link(s):
--   - 1 entry  -> whole-game video, used across all periods
--   - 4 entries -> one per quarter, indexed to play_by_play.period (1-based)
-- Nullable — games without attached video (imports, or any game not scored natively)
-- simply leave it null. This is the only schema change the native-entry feature needs;
-- every write target (play_by_play, lineup_stints, *_game_stats) already exists.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS video_urls TEXT[];

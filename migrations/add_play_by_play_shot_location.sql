-- Migration: shot location on play_by_play (shot chart)
-- Run this in Supabase SQL Editor.
--
-- Normalized half-court coordinates for a shot event, both in [0,1]:
--   shot_x = 0 (left sideline) .. 1 (right sideline)
--   shot_y = 0 (baseline / hoop end) .. 1 (half-court line)
-- Set on made/missed field-goal events when the coach taps the half-court; null
-- when a shot's location wasn't recorded. Level-agnostic (fractions of the court),
-- so the same values render on any court diagram.

alter table play_by_play
  add column if not exists shot_x real,
  add column if not exists shot_y real;

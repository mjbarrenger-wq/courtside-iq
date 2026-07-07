-- CIQ Rating: Courtside IQ's own player value metric, replacing Hoopsalytics VPS
-- as the headline. Blended box value + shrunk on-court impact, in points per 100
-- possessions. Computed by lib/advancedStats.ts (ciqRating); see that file for the
-- formula + weights. Nullable — a player with no possessions played has no rating.
alter table player_game_stats add column if not exists ciq_rating numeric;
comment on column player_game_stats.ciq_rating is
  'CIQ Rating: blended box value + shrunk on-court impact, points per 100 possessions. Courtside IQ value metric replacing Hoopsalytics VPS.';

// Row types for the Supabase tables the app reads.
//
// Mirrors the live schema (public.*) as PostgREST returns it over the REST
// endpoint: integer/numeric columns arrive as JSON numbers, dates and
// timestamps as ISO strings, nullable columns as `T | null`. Pages that select
// a subset of columns should `Pick<>` from these so a renamed column is a
// compile-time error instead of a silent `undefined` at runtime.
//
// Keep this file in step with migrations/ — it is the single place the rest of
// the app learns a column's name and type.

export interface GameRow {
  id: string
  team_id: string | null
  opponent_id: string | null
  game_date: string
  season: string | null
  round: string | null
  venue: string | null
  home_away: 'home' | 'away' | 'neutral' | null
  team_score: number | null
  opponent_score: number | null
  result: 'W' | 'L' | 'D' | null
  created_at: string | null
  game_type: string | null
  video_urls: string[] | null
}

/** `games?select=*,opponents(full_name)` — the embedded opponent relation. */
export interface GameWithOpponent extends GameRow {
  opponents: Pick<OpponentRow, 'full_name'> | null
}

export interface OpponentRow {
  id: string
  full_name: string
  organisation: string | null
  grade: string | null
}

export interface TeamRow {
  id: string
  organisation_id: string | null
  name: string
  grade: string | null
  season_year: number | null
  age_group: string | null
  created_at: string | null
  gender: string | null
  league: string | null
  division: string | null
  level: string | null
  head_coach: string | null
  home_venue: string | null
  season_format: string | null
}

export interface PlayerRow {
  id: string
  team_id: string | null
  first_name: string
  last_name: string
  jersey_number: number | null
  date_of_birth: string | null
  position: string | null
  active: boolean | null
  created_at: string | null
  primary_positions: string[] | null
  secondary_positions: string[] | null
}

export interface DrillRow {
  id: string
  pillar: string
  name: string
  difficulty: string
  difficulty_order: number
  players_min: number
  players_max: number
  duration_mins: number
  equipment: string | null
  setup: string
  execution: string
  coaching_cues: string[]
  progression: string | null
  tags: string[]
  created_at: string | null
  skill_levels: string[] | null
  age_suitability: string[] | null
}

export interface PlayerGameStatsRow {
  id: string
  game_id: string | null
  player_id: string | null
  time_played_seconds: number | null
  points: number | null
  reb: number | null
  reb_pct: number | null
  oreb: number | null
  dreb: number | null
  fouls: number | null
  off_fouls: number | null
  def_fouls: number | null
  plus_minus: number | null
  vps: number | null
  off_ppp: number | null
  def_ppp: number | null
  net_ppp: number | null
  twopt_made: number | null
  twopt_att: number | null
  twopt_fouled: number | null
  twopt_miss: number | null
  twopt_pct: number | null
  threept_made: number | null
  threept_att: number | null
  threept_fouled: number | null
  threept_miss: number | null
  threept_pct: number | null
  ft_made: number | null
  ft_att: number | null
  ft_miss: number | null
  ft_trips: number | null
  ft_pct: number | null
  ftf: number | null
  and1: number | null
  ast: number | null
  ast_pct: number | null
  blk: number | null
  blk_pct: number | null
  blk_per_foul: number | null
  stl: number | null
  stl_pct: number | null
  stl_per_foul: number | null
  turnovers: number | null
  to_pct: number | null
  a_to_ratio: number | null
  efg_pct: number | null
  ts_pct: number | null
  usage_pct: number | null
  off_rtg: number | null
  def_rtg: number | null
  pace: number | null
  off_pace: number | null
  mpg: number | null
  ns_fouls: number | null
  ns_fouls_bonus: number | null
  def_2pt_pct: number | null
  def_3pt_pct: number | null
  def_to_pct: number | null
  ciq_rating: number | null
}

export interface TeamGameStatsRow {
  id: string
  game_id: string | null
  team_id: string | null
  pts: number | null
  twopt_made: number | null
  twopt_att: number | null
  threept_made: number | null
  threept_att: number | null
  ft_made: number | null
  ft_att: number | null
  efg_pct: number | null
  ts_pct: number | null
  oreb: number | null
  dreb: number | null
  reb: number | null
  turnovers: number | null
  ast: number | null
  stl: number | null
  blk: number | null
  fouls: number | null
  off_fouls: number | null
  def_fouls: number | null
  possessions: number | null
  off_ppp: number | null
  def_ppp: number | null
  net_ppp: number | null
  created_at: string | null
}

export interface OpponentGameStatsRow {
  id: string
  game_id: string | null
  team_id: string | null
  opp_pts: number | null
  opp_twopt_made: number | null
  opp_twopt_att: number | null
  opp_threept_made: number | null
  opp_threept_att: number | null
  opp_ft_made: number | null
  opp_ft_att: number | null
  opp_possessions: number | null
  opp_turnovers: number | null
  opp_off_fouls: number | null
  opp_def_fouls: number | null
  opp_oreb: number | null
  opp_dreb: number | null
  opp_ast: number | null
  opp_stl: number | null
  opp_blk: number | null
  opp_off_ppp: number | null
  opp_def_ppp: number | null
  created_at: string | null
}

export interface OpponentPlayerGameStatsRow {
  id: string
  game_id: string | null
  jersey_number: number | null
  points: number | null
  twopt_made: number | null
  twopt_att: number | null
  threept_made: number | null
  threept_att: number | null
  ft_made: number | null
  ft_att: number | null
  oreb: number | null
  dreb: number | null
  reb: number | null
  ast: number | null
  stl: number | null
  blk: number | null
  turnovers: number | null
  fouls: number | null
  created_at: string | null
  time_played_seconds: number | null
}

export interface LineupStintRow {
  id: string
  game_id: string | null
  team_id: string | null
  period: number | null
  start_clock: string | null
  end_clock: string | null
  seconds: number | null
  player_ids: string[] | null
  pf: number | null
  pa: number | null
  off_poss: number | null
  def_poss: number | null
  off_ppp: number | null
  def_ppp: number | null
  net_ppp: number | null
  created_at: string | null
}

export type PlayByPlayEventType =
  | 'made_2pt' | 'missed_2pt' | 'made_3pt' | 'missed_3pt' | 'made_ft' | 'missed_ft'
  | 'oreb' | 'dreb' | 'assist' | 'steal' | 'block' | 'turnover'
  | 'def_foul' | 'off_foul' | 'foul' | 'sub_in' | 'sub_out'

export interface PlayByPlayRow {
  id: string
  game_id: string | null
  period: number | null
  /** Game clock, stored as seconds-remaining text (e.g. "595"). */
  clock_time: string | null
  /** Video playback position, stored as text. */
  video_time: string | null
  player_id: string | null
  jersey_number: number | null
  event_type: PlayByPlayEventType | null
  linked_play_id: string | null
  created_at: string | null
  event_order: number | null
  team_side: 'team' | 'opponent' | null
  points: number | null
  team_score: number | null
  opp_score: number | null
  shot_x: number | null
  shot_y: number | null
}

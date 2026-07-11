'use server'

import { supabase } from '@/lib/supabase'
import type { GameTypeKey } from '../dashboard/filterConfig'

// Our team — the single team this app tracks (matches scripts/import_pbp.mjs).
const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'

export interface GameEditableFields {
  game_date?: string
  opponent_id?: string
  home_away?: 'home' | 'away' | 'neutral'
  round?: string | null
  venue?: string | null
  game_type?: GameTypeKey
}

export interface NewGameFields {
  game_date: string
  opponent_id: string
  home_away: 'home' | 'away' | 'neutral'
  round?: string | null
  venue?: string | null
  game_type: GameTypeKey
  season?: string | null
  video_urls?: string[] | null // 1 (whole game) or 4 (per quarter) YouTube links
}

// Creates a new game row for native stat entry and returns its id. Score/result
// are intentionally left null — they are written later by finalizeNativeGame from
// the tallied event log, exactly as the box-score import sets them for imports.
//
// Same RLS discipline as updateGame: request the inserted row back and confirm it
// arrived. An INSERT blocked by a missing/mismatched RLS policy returns 0 rows with
// no error, which a bare `if (error)` would wave through as success.
export async function createGame(
  fields: NewGameFields,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const row = {
    team_id: TEAM_ID,
    game_date: fields.game_date,
    opponent_id: fields.opponent_id,
    home_away: fields.home_away,
    round: fields.round?.trim() ? fields.round.trim() : null,
    venue: fields.venue?.trim() ? fields.venue.trim() : null,
    game_type: fields.game_type,
    season: fields.season?.trim() ? fields.season.trim() : null,
    video_urls: fields.video_urls && fields.video_urls.length ? fields.video_urls : null,
  }
  const { data, error } = await supabase.from('games').insert(row).select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'No row created — check RLS INSERT policy on games.' }
  }
  return { success: true, id: data[0].id }
}

// Permanently deletes a game and every row that hangs off it. Child rows are
// removed first (no ON DELETE CASCADE on these FKs), then the game itself, whose
// deletion is confirmed via affected-row count — same silent-RLS-gap discipline
// as every other write path here.
export async function deleteGame(
  gameId: string,
): Promise<{ success: boolean; error?: string }> {
  // Every table with a game_id FK that is NOT ON DELETE CASCADE must be cleared
  // first, or Postgres blocks the games delete with a foreign-key violation.
  // (opponent_player_game_stats was added later and its omission here silently broke
  // delete for natively-scored games — team/opponent_game_stats cascade, so listing
  // them is harmless belt-and-braces.)
  const children = [
    'play_by_play', 'lineup_stints', 'player_game_stats',
    'team_game_stats', 'opponent_game_stats', 'opponent_player_game_stats',
  ]
  for (const table of children) {
    const { error } = await supabase.from(table).delete().eq('game_id', gameId)
    if (error) return { success: false, error: `delete ${table}: ${error.message}` }
  }
  // Stored AI debrief for this game (ai_content keys on entity_id).
  const { error: aiErr } = await supabase.from('ai_content').delete().eq('entity_id', gameId)
  if (aiErr) return { success: false, error: `delete ai_content: ${aiErr.message}` }

  const { data, error } = await supabase.from('games').delete().eq('id', gameId).select('id')
  if (error) return { success: false, error: `delete games: ${error.message}` }
  if (!data || data.length === 0) {
    return { success: false, error: 'No game deleted — check RLS DELETE policy on games.' }
  }
  return { success: true }
}

// Adds a new opponent (name only — organisation/grade stay null) and returns it,
// so the game-creation form can attach a team that isn't in the list yet. Same
// affected-row check as above (anon_insert_opponents policy already exists).
export async function createOpponent(
  fullName: string,
): Promise<{ success: boolean; id?: string; full_name?: string; error?: string }> {
  const name = fullName.trim()
  if (!name) return { success: false, error: 'Opponent name is required.' }
  const { data, error } = await supabase
    .from('opponents')
    .insert({ full_name: name })
    .select('id, full_name')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'No opponent created — check RLS INSERT policy on opponents.' }
  }
  return { success: true, id: data[0].id, full_name: data[0].full_name }
}

// Updates one game's setup fields (date, opponent, home/away, round, venue, type).
// Deliberately does NOT touch team_score / opponent_score / result — those are
// set by the box-score import and stay read-only here to avoid desyncing from
// player_game_stats / team_game_stats / opponent_game_stats.
//
// NB: request .select() and check that a row actually came back. An RLS policy
// gap (e.g. a table with grants but no UPDATE policy) makes Postgres return
// 0 rows affected with NO error — a naive `if (error)` check reports success
// on a write that silently did nothing. Hit exactly this on `games` once already.
export async function updateGame(
  gameId: string,
  fields: GameEditableFields,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.from('games').update(fields).eq('id', gameId).select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'No rows updated — check RLS UPDATE policy on games.' }
  }
  return { success: true }
}

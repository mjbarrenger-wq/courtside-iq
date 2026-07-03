'use server'

import { supabase } from '@/lib/supabase'
import type { GameTypeKey } from '../dashboard/filterConfig'

export interface GameEditableFields {
  game_date?: string
  opponent_id?: string
  home_away?: 'home' | 'away' | 'neutral'
  round?: string | null
  venue?: string | null
  game_type?: GameTypeKey
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

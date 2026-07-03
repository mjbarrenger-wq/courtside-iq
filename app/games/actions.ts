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
export async function updateGame(
  gameId: string,
  fields: GameEditableFields,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('games').update(fields).eq('id', gameId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

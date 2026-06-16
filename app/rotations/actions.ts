'use server'

import { supabase } from '@/lib/supabase'

export async function savePlayerPositions(
  playerId: string,
  primaryPositions: string[],
  secondaryPositions: string[],
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('players')
    .update({
      primary_positions:   primaryPositions,
      secondary_positions: secondaryPositions,
    })
    .eq('id', playerId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

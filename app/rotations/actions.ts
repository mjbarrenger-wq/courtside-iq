'use server'

import { supabase } from '@/lib/supabase'
import type { RotationPlanSnapshot, RotationPlanRecord } from './types'

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

// ── Rotation plan persistence ───────────────────────────────────────────────
// Plans are stored as a full JSONB snapshot in rotation_plans.state.

export async function saveRotationPlan(input: {
  id?: string
  teamId: string
  name: string
  gameId?: string | null
  state: RotationPlanSnapshot
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const row = {
    team_id: input.teamId,
    name: input.name.trim() || 'Untitled plan',
    game_id: input.gameId ?? null,
    state: input.state,
  }

  if (input.id) {
    const { error } = await supabase.from('rotation_plans').update(row).eq('id', input.id)
    if (error) return { success: false, error: error.message }
    return { success: true, id: input.id }
  }

  const { data, error } = await supabase
    .from('rotation_plans')
    .insert(row)
    .select('id')
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, id: data?.id as string | undefined }
}

export async function listRotationPlans(teamId: string): Promise<RotationPlanRecord[]> {
  const { data, error } = await supabase
    .from('rotation_plans')
    .select('id,name,game_id,updated_at,state')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false })

  if (error || !data) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(r => ({
    id: r.id,
    name: r.name,
    gameId: r.game_id ?? null,
    updatedAt: r.updated_at,
    state: r.state as RotationPlanSnapshot,
  }))
}

export async function deleteRotationPlan(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('rotation_plans').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

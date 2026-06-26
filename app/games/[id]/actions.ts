'use server'

import { generateAndStoreDebrief, type DebriefResult } from '@/lib/generateDebrief'

// Called by the Regenerate button. Generates a fresh debrief and writes it to
// the database (overwriting the stored copy), then returns the new text.
export async function regenerateGameDebrief(gameId: string): Promise<DebriefResult> {
  return generateAndStoreDebrief(gameId)
}

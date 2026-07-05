// Client-side state for an in-progress native game entry.
//
// Everything the coach taps lives here — in React state during the session and
// mirrored to localStorage — until Finalize writes it to the database in one pass.
// There are no per-tap network writes (STAT_ENTRY.md §3), so this is the single
// source of truth for the roster, the starting five, and the ordered event log
// while a game is being scored. A refresh or accidental tab close mid-game must
// not lose 20+ minutes of tallying, which is why it is persisted (§5).
import type { EventType, TeamSide } from './pbpAggregate'

// One logged event, shaped like a play_by_play row so finalize can pass the array
// straight into the shared aggregator and into the play_by_play insert.
export interface LocalEvent {
  event_order: number
  period: number
  event_type: EventType
  team_side: TeamSide
  points: number
  player_id: string | null
  jersey_number: number | null
  video_time: number | null // YouTube playback position at the tap (seconds)
  clock_sec: number | null   // optional manual game clock; unused in v1
  team_score: number         // running score AFTER this event
  opp_score: number
}

export interface EntryState {
  gameId: string
  dressed: string[]   // player_ids selected as dressed for this game
  starters: string[]  // the five player_ids on court at tip-off
  period: number      // quarter currently being entered (1-4)
  events: LocalEvent[]
  updatedAt: number
}

const keyFor = (gameId: string) => `courtside_entry_${gameId}`

export function loadEntryState(gameId: string): EntryState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(keyFor(gameId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as EntryState
    if (!parsed || parsed.gameId !== gameId || !Array.isArray(parsed.events)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveEntryState(state: EntryState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(keyFor(state.gameId), JSON.stringify(state))
  } catch {
    // localStorage full or unavailable — the in-memory React state still holds the
    // session; persistence is a safety net, not a hard dependency.
  }
}

export function clearEntryState(gameId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(keyFor(gameId))
  } catch {
    /* ignore */
  }
}

export function newEntryState(gameId: string, dressed: string[], starters: string[]): EntryState {
  return { gameId, dressed, starters, period: 1, events: [], updatedAt: Date.now() }
}

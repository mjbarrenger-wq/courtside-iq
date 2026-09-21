export type FilterKey = 'all' | 'last5' | 'last10' | 'wins' | 'losses' | 'close_games'

export const FILTER_CONFIG: { key: FilterKey; label: string; emoji: string }[] = [
  { key: 'all',         label: 'All Games',   emoji: '📅' },
  { key: 'last5',       label: 'Last 5',       emoji: '🕐' },
  { key: 'last10',      label: 'Last 10',      emoji: '🕑' },
  { key: 'wins',        label: 'Wins Only',    emoji: '✅' },
  { key: 'losses',      label: 'Losses Only',  emoji: '❌' },
  { key: 'close_games', label: 'Close Games',  emoji: '⚡' },
]

export type GameTypeKey = 'all_types' | 'regular_season' | 'playoff' | 'tournament' | 'grading' | 'practice'

/** The real values stored in `games.game_type`. `all_types` is a UI pseudo-key, not a type. */
export type ConcreteGameType = Exclude<GameTypeKey, 'all_types'>

export const GAME_TYPE_CONFIG: { key: GameTypeKey; label: string; emoji: string }[] = [
  { key: 'all_types',      label: 'All Types',       emoji: '🏀' },
  { key: 'regular_season', label: 'Regular Season',  emoji: '📆' },
  { key: 'playoff',        label: 'Finals',          emoji: '🏆' },
  { key: 'tournament',     label: 'Tournament',      emoji: '🎯' },
  { key: 'grading',        label: 'Grading',         emoji: '📊' },
  { key: 'practice',       label: 'Practice',        emoji: '🔁' },
]

/** Every selectable type, in the order the chips are drawn. */
export const CONCRETE_GAME_TYPES: ConcreteGameType[] =
  GAME_TYPE_CONFIG.filter(t => t.key !== 'all_types').map(t => t.key as ConcreteGameType)

const TYPE_LABEL: Record<ConcreteGameType, string> = Object.fromEntries(
  GAME_TYPE_CONFIG.filter(t => t.key !== 'all_types').map(t => [t.key, t.label]),
) as Record<ConcreteGameType, string>

const isConcrete = (s: string): s is ConcreteGameType =>
  (CONCRETE_GAME_TYPES as string[]).includes(s)

/**
 * Read the `type` search param into the set of selected types.
 *
 * The param is a comma-separated list (`?type=regular_season,playoff`). A single
 * legacy value (`?type=playoff`) still parses, and anything missing, empty,
 * unrecognised or `all_types` selects everything — the filter is never allowed to
 * resolve to an empty set, which would show a blank page with no way back.
 */
export function parseGameTypes(raw: string | string[] | undefined): ConcreteGameType[] {
  const text = Array.isArray(raw) ? raw.join(',') : raw
  if (!text) return [...CONCRETE_GAME_TYPES]
  const picked = text.split(',').map(s => s.trim()).filter(isConcrete)
  // De-duplicate and restore chip order so the label reads consistently.
  const set = new Set(picked)
  const ordered = CONCRETE_GAME_TYPES.filter(t => set.has(t))
  return ordered.length ? ordered : [...CONCRETE_GAME_TYPES]
}

/** Write the selection back to a `type` param value. */
export function serialiseGameTypes(types: ConcreteGameType[]): string {
  return isAllGameTypes(types) ? 'all_types' : types.join(',')
}

export function isAllGameTypes(types: ConcreteGameType[]): boolean {
  return types.length === CONCRETE_GAME_TYPES.length
}

/**
 * Does a game pass the type filter? A null `game_type` is treated as a regular
 * season game, matching the default on the column and how /games displays it.
 */
export function matchesGameType(
  gameType: string | null | undefined, selected: ConcreteGameType[],
): boolean {
  if (isAllGameTypes(selected)) return true
  return (selected as string[]).includes(gameType ?? 'regular_season')
}

/** Toggle one chip, never leaving the selection empty (the last one off resets to all). */
export function toggleGameType(
  selected: ConcreteGameType[], key: ConcreteGameType,
): ConcreteGameType[] {
  const set = new Set(selected)
  if (set.has(key)) set.delete(key); else set.add(key)
  const next = CONCRETE_GAME_TYPES.filter(t => set.has(t))
  return next.length ? next : [...CONCRETE_GAME_TYPES]
}

/** Human-readable selection, e.g. "Finals", "Regular Season + Finals", "All but Practice". */
export function gameTypeLabel(selected: ConcreteGameType[]): string {
  if (isAllGameTypes(selected)) return 'All Types'
  if (selected.length === 1) return TYPE_LABEL[selected[0]]
  // One short of everything reads better as an exclusion than as a four-way list.
  if (selected.length === CONCRETE_GAME_TYPES.length - 1) {
    const missing = CONCRETE_GAME_TYPES.find(t => !selected.includes(t))!
    return `All but ${TYPE_LABEL[missing]}`
  }
  return selected.map(t => TYPE_LABEL[t]).join(' + ')
}

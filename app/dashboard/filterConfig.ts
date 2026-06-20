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

export const GAME_TYPE_CONFIG: { key: GameTypeKey; label: string; emoji: string }[] = [
  { key: 'all_types',      label: 'All Types',       emoji: '🏀' },
  { key: 'regular_season', label: 'Regular Season',  emoji: '📆' },
  { key: 'playoff',        label: 'Finals',          emoji: '🏆' },
  { key: 'tournament',     label: 'Tournament',      emoji: '🎯' },
  { key: 'grading',        label: 'Grading',         emoji: '📊' },
  { key: 'practice',       label: 'Practice',        emoji: '🔁' },
]

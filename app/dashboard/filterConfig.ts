export type FilterKey = 'all' | 'last5' | 'last10' | 'wins' | 'losses' | 'last3losses' | 'close_games'

export const FILTER_CONFIG: { key: FilterKey; label: string; emoji: string }[] = [
  { key: 'all',         label: 'All Games',    emoji: '📅' },
  { key: 'last5',       label: 'Last 5',        emoji: '🕐' },
  { key: 'last10',      label: 'Last 10',       emoji: '🕑' },
  { key: 'wins',        label: 'Wins Only',     emoji: '✅' },
  { key: 'losses',      label: 'Losses Only',   emoji: '❌' },
  { key: 'last3losses', label: 'Last 3 Losses', emoji: '🔍' },
  { key: 'close_games', label: 'Close Games',   emoji: '⚡' },
]

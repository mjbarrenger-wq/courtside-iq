// Stat categories selectable on the Season Trend chart. 'ppp' is a special
// combined mode that renders the original 3-line Off/Def/Net PPP comparison
// (with independent show/hide toggles); every other key renders as a single
// line + rolling average. Every category is available in both team mode and
// player mode — box-score categories are computed from the same raw fields
// either summed across the team's player_game_stats rows (team mode) or read
// directly off the selected player's own row (player mode), via the shared
// computeBoxStats() helper in page.tsx.

export type StatKey =
  | 'ppp' | 'offPpp' | 'defPpp' | 'netPpp'
  | 'ppg' | 'toPct' | 'efg' | 'reb' | 'oreb' | 'dreb' | 'ast' | 'stl' | 'blk' | 'ftPct'

export interface StatCategory {
  key: StatKey
  label: string
  shortLabel: string
  color: string
  format: 'ppp' | 'pct' | 'num'
  higherBetter: boolean
}

export const STAT_CATEGORIES: StatCategory[] = [
  { key: 'ppp',    label: 'PPP — Off / Def / Net', shortLabel: 'PPP (all)',  color: '#059669', format: 'ppp', higherBetter: true },
  { key: 'netPpp', label: 'Net PPP',               shortLabel: 'Net PPP',    color: '#059669', format: 'num', higherBetter: true },
  { key: 'offPpp', label: 'Offensive PPP',         shortLabel: 'Off PPP',    color: '#307b92', format: 'num', higherBetter: true },
  { key: 'defPpp', label: 'Defensive PPP',         shortLabel: 'Def PPP',    color: '#e05555', format: 'num', higherBetter: false },
  { key: 'ppg',    label: 'Points Per Game',       shortLabel: 'PPG',        color: '#307b92', format: 'num', higherBetter: true },
  { key: 'toPct',  label: 'Turnover %',            shortLabel: 'TO%',        color: '#dc2626', format: 'pct', higherBetter: false },
  { key: 'efg',    label: 'Effective FG%',         shortLabel: 'eFG%',       color: '#307b92', format: 'pct', higherBetter: true },
  { key: 'reb',    label: 'Rebounds Per Game',     shortLabel: 'REB/G',      color: '#7a9eb5', format: 'num', higherBetter: true },
  { key: 'oreb',   label: 'Offensive Rebounds Per Game', shortLabel: 'OREB/G', color: '#0e7490', format: 'num', higherBetter: true },
  { key: 'dreb',   label: 'Defensive Rebounds Per Game', shortLabel: 'DREB/G', color: '#0369a1', format: 'num', higherBetter: true },
  { key: 'ast',    label: 'Assists Per Game',      shortLabel: 'AST/G',      color: '#d97706', format: 'num', higherBetter: true },
  { key: 'stl',    label: 'Steals Per Game',       shortLabel: 'STL/G',      color: '#059669', format: 'num', higherBetter: true },
  { key: 'blk',    label: 'Blocks Per Game',       shortLabel: 'BLK/G',      color: '#1e6a82', format: 'num', higherBetter: true },
  { key: 'ftPct',  label: 'Free Throw %',          shortLabel: 'FT%',        color: '#d97706', format: 'pct', higherBetter: true },
]

export function getStatCategory(key: string): StatCategory {
  return STAT_CATEGORIES.find(c => c.key === key) ?? STAT_CATEGORIES[0]
}

export function formatStatValue(value: number | null, format: StatCategory['format']): string {
  if (value == null) return '—'
  if (format === 'pct') return `${value.toFixed(1)}%`
  return value.toFixed(value < 10 && format === 'num' ? 2 : 1)
}

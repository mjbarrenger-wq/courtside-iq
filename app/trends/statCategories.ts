// Stat categories selectable on the Season Trend chart. 'ppp' is a special
// combined mode that renders the original 3-line Off/Def/Net PPP comparison
// (with independent show/hide toggles); every other key renders as a single
// line + rolling average. `teamOnly` categories are hidden from the menu
// when a specific player is selected — box-score aggregates below are only
// computed at team level (player_game_stats already carries off/def/net PPP
// per player per game, so PPP categories work fine in player mode too).

export type StatKey =
  | 'ppp' | 'offPpp' | 'defPpp' | 'netPpp'
  | 'ppg' | 'toPct' | 'efg' | 'reb' | 'ast' | 'stl' | 'blk' | 'ftPct'

export interface StatCategory {
  key: StatKey
  label: string
  shortLabel: string
  color: string
  format: 'ppp' | 'pct' | 'num'
  higherBetter: boolean
  teamOnly?: boolean
}

export const STAT_CATEGORIES: StatCategory[] = [
  { key: 'ppp',    label: 'PPP — Off / Def / Net', shortLabel: 'PPP (all)',  color: '#059669', format: 'ppp', higherBetter: true },
  { key: 'netPpp', label: 'Net PPP',               shortLabel: 'Net PPP',    color: '#059669', format: 'num', higherBetter: true },
  { key: 'offPpp', label: 'Offensive PPP',         shortLabel: 'Off PPP',    color: '#307b92', format: 'num', higherBetter: true },
  { key: 'defPpp', label: 'Defensive PPP',         shortLabel: 'Def PPP',    color: '#e05555', format: 'num', higherBetter: false },
  { key: 'ppg',    label: 'Points Per Game',       shortLabel: 'PPG',        color: '#307b92', format: 'num', higherBetter: true,  teamOnly: true },
  { key: 'toPct',  label: 'Turnover %',            shortLabel: 'TO%',        color: '#dc2626', format: 'pct', higherBetter: false, teamOnly: true },
  { key: 'efg',    label: 'Effective FG%',         shortLabel: 'eFG%',       color: '#307b92', format: 'pct', higherBetter: true,  teamOnly: true },
  { key: 'reb',    label: 'Rebounds Per Game',     shortLabel: 'REB/G',      color: '#7a9eb5', format: 'num', higherBetter: true,  teamOnly: true },
  { key: 'ast',    label: 'Assists Per Game',      shortLabel: 'AST/G',      color: '#d97706', format: 'num', higherBetter: true,  teamOnly: true },
  { key: 'stl',    label: 'Steals Per Game',       shortLabel: 'STL/G',      color: '#059669', format: 'num', higherBetter: true,  teamOnly: true },
  { key: 'blk',    label: 'Blocks Per Game',       shortLabel: 'BLK/G',      color: '#1e6a82', format: 'num', higherBetter: true,  teamOnly: true },
  { key: 'ftPct',  label: 'Free Throw %',          shortLabel: 'FT%',        color: '#d97706', format: 'pct', higherBetter: true,  teamOnly: true },
]

export function getStatCategory(key: string): StatCategory {
  return STAT_CATEGORIES.find(c => c.key === key) ?? STAT_CATEGORIES[0]
}

export function formatStatValue(value: number | null, format: StatCategory['format']): string {
  if (value == null) return '—'
  if (format === 'pct') return `${value.toFixed(1)}%`
  return value.toFixed(value < 10 && format === 'num' ? 2 : 1)
}

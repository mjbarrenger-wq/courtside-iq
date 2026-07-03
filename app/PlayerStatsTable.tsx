'use client'

import { useState } from 'react'

export interface PlayerRow {
  id: string
  name: string
  jersey: number
  gp: number
  ppg: number
  rpg: number
  orpg: number
  drpg: number
  apg: number
  spg: number
  bpg: number
  topg: number
  fg_pct: number
  ts_pct: number
  ft_pct: number
}

type SortKey = keyof Omit<PlayerRow, 'id' | 'name'>
type SortDir = 'asc' | 'desc'

const BORDER = '#e2e5eb'
const CARD   = '#ffffff'

const COLS: { key: SortKey; label: string; title: string; lowerBetter?: boolean; isPct?: boolean }[] = [
  { key: 'jersey', label: '#',     title: 'Jersey number' },
  { key: 'gp',     label: 'GP',    title: 'Games played' },
  { key: 'ppg',    label: 'PPG',   title: 'Points per game' },
  { key: 'rpg',    label: 'RPG',   title: 'Rebounds per game' },
  { key: 'orpg',   label: 'OREB',  title: 'Offensive rebounds per game' },
  { key: 'drpg',   label: 'DREB',  title: 'Defensive rebounds per game' },
  { key: 'apg',    label: 'APG',   title: 'Assists per game' },
  { key: 'spg',    label: 'SPG',   title: 'Steals per game' },
  { key: 'bpg',    label: 'BPG',   title: 'Blocks per game' },
  { key: 'topg',   label: 'TO/G',  title: 'Turnovers per game', lowerBetter: true },
  { key: 'fg_pct', label: 'FG%',   title: 'Field goal percentage (2pt + 3pt)', isPct: true },
  { key: 'ts_pct', label: 'TS%',   title: 'True shooting % — accounts for 2pt, 3pt and free throws. Formula: pts ÷ (2 × (FGA + 0.44 × FTA))', isPct: true },
  { key: 'ft_pct', label: 'FT%',   title: 'Free throw percentage', isPct: true },
]

export default function PlayerStatsTable({ players }: { players: PlayerRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('ppg')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      // Default direction: lower-better stats sort ascending first
      const col = COLS.find(c => c.key === key)
      setSortDir(col?.lowerBetter ? 'asc' : 'desc')
      setSortKey(key)
    }
  }

  const sorted = [...players].sort((a, b) => {
    const aVal = a[sortKey] as number
    const bVal = b[sortKey] as number
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal
  })

  const arrow = (key: SortKey) => {
    if (key !== sortKey) return <span style={{ color: '#e2e5eb', marginLeft: 3 }}>↕</span>
    return <span style={{ color: '#307b92', marginLeft: 3 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 28 }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#307b92' }}>SEASON PLAYER AVERAGES</span>
        <span style={{ fontSize: 11, color: '#6b7280' }}>Click any column to sort</span>
      </div>
      {/* Wide stat table: scrolls horizontally below desktop so all columns stay
          full-size and legible. On desktop the parent is far wider than min-width,
          so width:100% wins and the layout is unchanged. */}
      <div className="overflow-x-auto">
      <table className="min-w-[820px]" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f0f2f7' }}>
            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${BORDER}` }}>
              Player
            </th>
            {COLS.map(col => (
              <th
                key={col.key}
                title={col.title}
                onClick={() => handleSort(col.key)}
                style={{
                  padding: '10px 14px', textAlign: 'center',
                  fontSize: 10, fontWeight: 700,
                  color: col.key === sortKey ? '#307b92' : '#6b7280',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  borderBottom: `1px solid ${BORDER}`,
                  cursor: 'pointer', userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}{arrow(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr
              key={p.id}
              style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? 'transparent' : '#f8f9fb' }}
            >
              <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                <a href={`/players/${p.id}`} style={{ color: '#307b92', textDecoration: 'none', fontWeight: 700 }}>
                  #{p.jersey} {p.name}
                </a>
              </td>
              {COLS.map(col => {
                const val = p[col.key] as number
                const isActive = col.key === sortKey
                const formatted = col.isPct
                  ? (val > 0 ? `${val}%` : '—')
                  : col.key === 'jersey' || col.key === 'gp'
                  ? val
                  : val > 0 ? val.toFixed(1) : '—'
                return (
                  <td
                    key={col.key}
                    style={{
                      padding: '10px 14px', textAlign: 'center',
                      color: isActive ? '#1a1f2e' : '#374151',
                      fontWeight: isActive ? 700 : 400,
                    }}
                  >
                    {formatted}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'

export interface OppRow {
  jersey_number: number | null
  time_played_seconds?: number | null
  points: number
  twopt_made: number; twopt_att: number
  threept_made: number; threept_att: number
  ft_made: number; ft_att: number
  oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number
  turnovers: number; fouls: number
}

const TEAL = '#307b92', BORDER = '#e2e5eb', MUTED = '#6b7280', SEC = '#374151'

const fmtMin = (s: number | null | undefined) => {
  if (s == null || s <= 0) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

// Opponent per-player box score (native games only). Collapsible — hidden by default
// so it doesn't crowd the page, since it's a secondary/scouting view.
export default function OpponentBox({ rows, oppName }: { rows: OppRow[]; oppName: string }) {
  const [open, setOpen] = useState(false)
  if (!rows.length) return null

  // jersey rows first (ascending), the team/unnumbered bucket last.
  const sorted = [...rows].sort((a, b) => {
    if (a.jersey_number == null) return 1
    if (b.jersey_number == null) return -1
    return a.jersey_number - b.jersey_number
  })
  const tot = sorted.reduce((s, r) => ({
    points: s.points + r.points, twopt_made: s.twopt_made + r.twopt_made, twopt_att: s.twopt_att + r.twopt_att,
    threept_made: s.threept_made + r.threept_made, threept_att: s.threept_att + r.threept_att,
    ft_made: s.ft_made + r.ft_made, ft_att: s.ft_att + r.ft_att, oreb: s.oreb + r.oreb, dreb: s.dreb + r.dreb,
    reb: s.reb + r.reb, ast: s.ast + r.ast, stl: s.stl + r.stl, blk: s.blk + r.blk,
    turnovers: s.turnovers + r.turnovers, fouls: s.fouls + r.fouls,
  }), { points: 0, twopt_made: 0, twopt_att: 0, threept_made: 0, threept_att: 0, ft_made: 0, ft_att: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, turnovers: 0, fouls: 0 })

  const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: MUTED, textAlign: 'right', padding: '6px 8px', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { fontSize: 13, color: SEC, textAlign: 'right', padding: '6px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  type StatKey = 'points' | 'oreb' | 'dreb' | 'reb' | 'ast' | 'stl' | 'blk' | 'turnovers' | 'fouls'
  const COLS: { key: StatKey; label: string }[] = [
    { key: 'points', label: 'PTS' }, { key: 'oreb', label: 'OREB' }, { key: 'dreb', label: 'DREB' },
    { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' }, { key: 'stl', label: 'STL' },
    { key: 'blk', label: 'BLK' }, { key: 'turnovers', label: 'TO' }, { key: 'fouls', label: 'PF' },
  ]

  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
        borderBottom: open ? `1px solid ${BORDER}` : 'none',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEAL }}>OPPONENT BOX SCORE — {oppName.toUpperCase()}</span>
        <span style={{ fontSize: 12, color: MUTED }}>{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                <th style={{ ...th, textAlign: 'left' }}>PLAYER</th>
                <th style={th}>MIN</th>
                <th style={th}>FG</th><th style={th}>3PT</th><th style={th}>FT</th>
                {COLS.map(c => <th key={c.key} style={th}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#1a1f2e' }}>
                    {r.jersey_number == null ? 'Team / —' : `#${r.jersey_number}`}
                  </td>
                  <td style={{ ...td, color: MUTED }}>{fmtMin(r.time_played_seconds)}</td>
                  <td style={td}>{r.twopt_made + r.threept_made}/{r.twopt_att + r.threept_att}</td>
                  <td style={td}>{r.threept_made}/{r.threept_att}</td>
                  <td style={td}>{r.ft_made}/{r.ft_att}</td>
                  {COLS.map(c => <td key={c.key} style={td}>{r[c.key] as number}</td>)}
                </tr>
              ))}
              <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: '#1a1f2e' }}>TOTAL</td>
                <td style={{ ...td, color: MUTED }}>—</td>
                <td style={td}>{tot.twopt_made + tot.threept_made}/{tot.twopt_att + tot.threept_att}</td>
                <td style={td}>{tot.threept_made}/{tot.threept_att}</td>
                <td style={td}>{tot.ft_made}/{tot.ft_att}</td>
                {COLS.map(c => <td key={c.key} style={{ ...td, fontWeight: 800 }}>{tot[c.key] as number}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

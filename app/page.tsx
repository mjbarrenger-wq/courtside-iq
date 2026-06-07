export const dynamic = 'force-dynamic'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function fetchJson(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: 'no-store',
  })
  return res.json()
}

const BG     = '#07111e'
const BORDER = '#2a4a6e'
const CARD   = '#0d1b2e'
const HEADER = '#0a1628'

export default async function Home() {
  const [gamesRaw, stats, players] = await Promise.all([
    fetchJson('games?select=*,opponents(full_name)&order=game_date.asc'),
    fetchJson('player_game_stats?select=player_id,points,reb,ast,stl,blk'),
    fetchJson('players?select=*&order=jersey_number.asc'),
  ])

  const games = (Array.isArray(gamesRaw) ? gamesRaw : []).map((g: any) => ({
    ...g,
    opponent_name: g.opponents?.full_name ?? 'Unknown',
  }))

  const wins      = games.filter((g: any) => g.result === 'W').length
  const losses    = games.filter((g: any) => g.result === 'L').length
  const totalFor  = games.reduce((s: number, g: any) => s + g.team_score, 0)
  const totalOpp  = games.reduce((s: number, g: any) => s + g.opponent_score, 0)
  const pointDiff = totalFor - totalOpp
  const ppg       = games.length ? (totalFor / games.length).toFixed(1) : '—'
  const oppPpg    = games.length ? (totalOpp / games.length).toFixed(1) : '—'

  const playerTotals = (Array.isArray(players) ? players : []).map((p: any) => {
    const ps = (Array.isArray(stats) ? stats : []).filter((s: any) => s.player_id === p.id)
    const sum = (key: string) => ps.reduce((s: number, r: any) => s + (r[key] || 0), 0)
    const gp  = ps.length
    return {
      id: p.id, name: `${p.first_name} ${p.last_name}`, jersey: p.jersey_number,
      gp, pts: sum('points'), reb: sum('reb'), ast: sum('ast'), stl: sum('stl'), blk: sum('blk'),
      ppg: gp ? (sum('points') / gp).toFixed(1) : '—',
    }
  }).sort((a: any, b: any) => b.pts - a.pts)

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#e2e8f0',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 64px',
    }}>

      {/* ── Header ── */}
      <div style={{ background: HEADER, borderBottom: `1px solid ${BORDER}`, padding: '20px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.05em' }}>
              COURTSIDE IQ
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
              WGT 12.2 · U12 Basketball · Melbourne · Season 2025–26 &nbsp;·&nbsp;
              <span style={{ color: '#307b92', fontWeight: 600 }}>CMD Sports Analytics</span>
            </div>
          </div>
          {/* Season record pills */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{
              background: '#052e16', border: '1px solid #16a34a', borderRadius: 20,
              padding: '4px 14px', fontSize: 13, fontWeight: 700, color: '#22c55e',
            }}>{wins}–{losses}</span>
            <span style={{
              background: '#07111e', border: `1px solid ${BORDER}`, borderRadius: 20,
              padding: '4px 14px', fontSize: 13, fontWeight: 700,
              color: pointDiff >= 0 ? '#22c55e' : '#ef4444',
            }}>{pointDiff >= 0 ? '+' : ''}{pointDiff} PTS</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 0' }}>

        {/* ── Nav cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 40 }}>

          {/* Coaching Intelligence */}
          <a href="/dashboard" style={{ textDecoration: 'none' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #307b92',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#97cfdc', letterSpacing: '0.08em' }}>
                  COACHING INTELLIGENCE
                </div>
                <span style={{ fontSize: 18, color: '#307b92' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', marginBottom: 10, lineHeight: 1.2 }}>
                Value Driver Tree
              </div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>
                Net PPP decomposition across 8 performance pillars. Understand what's driving wins and
                losses — shot efficiency, possession control, defensive pressure, and more.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Net PPP', 'Driver Scores', 'AI Priorities'].map(tag => (
                  <span key={tag} style={{
                    background: '#0a1628', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#97cfdc',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Player Quadrants */}
          <a href="/players" style={{ textDecoration: 'none' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #8b5cf6',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.08em' }}>
                  PLAYER ANALYSIS
                </div>
                <span style={{ fontSize: 18, color: '#8b5cf6' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', marginBottom: 10, lineHeight: 1.2 }}>
                Player Quadrants
              </div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>
                Offensive vs Defensive PPP for every player. Identify two-way contributors,
                specialists, and development priorities. Filter by game window or date range.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Off/Def PPP', 'Quadrant Map', 'So What?'].map(tag => (
                  <span key={tag} style={{
                    background: '#0a1628', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#c4b5fd',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Drills Library */}
          <a href="/drills" style={{ textDecoration: 'none' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #10b981',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6ee7b7', letterSpacing: '0.08em' }}>
                  TRAINING TOOLS
                </div>
                <span style={{ fontSize: 18, color: '#10b981' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', marginBottom: 10, lineHeight: 1.2 }}>
                Drills Library
              </div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>
                80 drills across all 8 driver pillars — ranked by your team's current performance
                data. Worst-performing areas surface first.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['80 Drills', 'Data-Ranked', 'All Pillars'].map(tag => (
                  <span key={tag} style={{
                    background: '#0a1628', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#6ee7b7',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>
        </div>

        {/* ── Season snapshot ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Record',    value: `${wins}–${losses}`,                colour: '#22c55e' },
            { label: 'Games',     value: String(games.length),               colour: '#e2e8f0' },
            { label: 'PPG',       value: ppg,                                colour: '#97cfdc' },
            { label: 'Opp PPG',   value: oppPpg,                             colour: '#c4b5fd' },
            { label: 'Pt Diff',   value: `${pointDiff >= 0 ? '+' : ''}${pointDiff}`, colour: pointDiff >= 0 ? '#22c55e' : '#ef4444' },
          ].map(({ label, value, colour }) => (
            <div key={label} style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: '16px 16px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: colour }}>{value}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Player stats table ── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 28 }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#97cfdc' }}>SEASON PLAYER STATS</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#0a1628' }}>
                {['#', 'Player', 'GP', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'PPG'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px',
                    textAlign: h === 'Player' ? 'left' : 'center',
                    fontSize: 10, fontWeight: 700, color: '#64748b',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    borderBottom: `1px solid ${BORDER}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {playerTotals.map((p: any, i: number) => (
                <tr key={p.id} style={{
                  borderBottom: `1px solid ${BORDER}`,
                  background: i % 2 === 0 ? 'transparent' : '#0a1628',
                }}>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b' }}>#{p.jersey}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#e2e8f0' }}>{p.name}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8' }}>{p.gp}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#e2e8f0' }}>{p.pts}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8' }}>{p.reb}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8' }}>{p.ast}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8' }}>{p.stl}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8' }}>{p.blk}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#97cfdc' }}>{p.ppg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Recent games ── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#97cfdc' }}>RECENT RESULTS</span>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...games].reverse().slice(0, 10).map((g: any) => {
              const date = new Date(g.game_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
              return (
                <div key={g.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: 8,
                  background: BG, border: `1px solid ${BORDER}`,
                }}>
                  <span style={{ fontSize: 11, color: '#64748b', width: 60 }}>{date}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8', flex: 1, textAlign: 'center' }}>
                    {g.home_away === 'home' ? 'vs' : '@'} {g.opponent_name}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', width: 80, textAlign: 'center' }}>
                    {g.team_score} – {g.opponent_score}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 800, width: 28, textAlign: 'center',
                    color: g.result === 'W' ? '#22c55e' : '#ef4444',
                  }}>{g.result}</span>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </main>
  )
}

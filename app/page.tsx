import PlayerStatsTable from './PlayerStatsTable'

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

const BG     = '#0f1117'
const BORDER = '#2e374d'
const CARD   = '#171c2a'
const HEADER = '#1f2537'

export default async function Home() {
  const [gamesRaw, stats, players, drillsRaw] = await Promise.all([
    fetchJson('games?select=*,opponents(full_name)&order=game_date.asc'),
    fetchJson('player_game_stats?select=player_id,points,oreb,dreb,ast,stl,blk,turnovers,ft_made,ft_att'),
    fetchJson('players?select=*&order=jersey_number.asc'),
    fetchJson('drills?select=id'),
  ])
  const drillCount = Array.isArray(drillsRaw) ? drillsRaw.length : 0

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
    const ps  = (Array.isArray(stats) ? stats : []).filter((s: any) => s.player_id === p.id)
    const sum = (key: string) => ps.reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0)
    const gp  = ps.length
    const avg = (key: string) => gp > 0 ? Math.round((sum(key) / gp) * 10) / 10 : 0
    const ftMade = sum('ft_made'), ftAtt = sum('ft_att')
    return {
      id:     p.id,
      name:   `${p.first_name} ${p.last_name}`,
      jersey: p.jersey_number,
      gp,
      ppg:    avg('points'),
      rpg:    Math.round(((sum('oreb') + sum('dreb')) / Math.max(gp, 1)) * 10) / 10,
      apg:    avg('ast'),
      spg:    avg('stl'),
      bpg:    avg('blk'),
      topg:   avg('turnovers'),
      ft_pct: ftAtt > 0 ? Math.round((ftMade / ftAtt) * 1000) / 10 : 0,
    }
  })

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#e8eaf0',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 64px',
    }}>

      {/* ── Header ── */}
      <div style={{ background: HEADER, borderBottom: `1px solid ${BORDER}`, padding: '20px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#e8eaf0', letterSpacing: '0.05em' }}>
              COURTSIDE IQ
            </div>
            <div style={{ fontSize: 12, color: '#a0a8bc', marginTop: 3 }}>
              WGT 12.2 · U12 Basketball · Melbourne · Season 2025–26 &nbsp;·&nbsp;
              <span style={{ color: '#97cfdc', fontWeight: 700 }}>CMD Sports Analytics</span>
            </div>
          </div>
          {/* Season record pills */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{
              background: '#052e16', border: '1px solid #16a34a', borderRadius: 20,
              padding: '4px 14px', fontSize: 13, fontWeight: 700, color: '#34d399',
            }}>{wins}–{losses}</span>
            <span style={{
              background: '#0f1117', border: `1px solid ${BORDER}`, borderRadius: 20,
              padding: '4px 14px', fontSize: 13, fontWeight: 700,
              color: pointDiff >= 0 ? '#34d399' : '#f87171',
            }}>{pointDiff >= 0 ? '+' : ''}{pointDiff} PTS</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 0' }}>

        {/* ── Nav cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 20, marginBottom: 40 }}>

          {/* Coaching Intelligence */}
          <a href="/dashboard" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #307b92',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#97cfdc', letterSpacing: '0.08em' }}>
                  COACHING INTELLIGENCE
                </div>
                <span style={{ fontSize: 18, color: '#307b92' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e8eaf0', marginBottom: 10, lineHeight: 1.2 }}>
                Value Driver Tree
              </div>
              <div style={{ fontSize: 13, color: '#a0a8bc', lineHeight: 1.7, flex: 1 }}>
                Net PPP decomposition across 8 performance pillars. Understand what's driving wins and
                losses — shot efficiency, possession control, defensive pressure, and more.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Net PPP', 'Driver Scores', 'AI Priorities'].map(tag => (
                  <span key={tag} style={{
                    background: '#1f2537', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#97cfdc',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Player Quadrants */}
          <a href="/players" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #97cfdc',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7a9eb5', letterSpacing: '0.08em' }}>
                  PLAYER ANALYSIS
                </div>
                <span style={{ fontSize: 18, color: '#97cfdc' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e8eaf0', marginBottom: 10, lineHeight: 1.2 }}>
                Player Quadrants
              </div>
              <div style={{ fontSize: 13, color: '#a0a8bc', lineHeight: 1.7, flex: 1 }}>
                Offensive vs Defensive PPP for every player. Identify two-way contributors,
                specialists, and development priorities. Filter by game window or date range.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Off/Def PPP', 'Quadrant Map', 'So What?'].map(tag => (
                  <span key={tag} style={{
                    background: '#1f2537', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#7a9eb5',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Drills Library */}
          <a href="/drills" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #10b981',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#34d399', letterSpacing: '0.08em' }}>
                  TRAINING TOOLS
                </div>
                <span style={{ fontSize: 18, color: '#34d399' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e8eaf0', marginBottom: 10, lineHeight: 1.2 }}>
                Drills Library
              </div>
              <div style={{ fontSize: 13, color: '#a0a8bc', lineHeight: 1.7, flex: 1 }}>
                {drillCount} drills across all 8 driver pillars — ranked by your team's current performance
                data. Worst-performing areas surface first.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[`${drillCount} Drills`, 'Data-Ranked', 'All Pillars'].map(tag => (
                  <span key={tag} style={{
                    background: '#1f2537', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#34d399',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Glossary */}
          <a href="/glossary" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #64748b',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#a0a8bc', letterSpacing: '0.08em' }}>
                  REFERENCE
                </div>
                <span style={{ fontSize: 18, color: '#6d7894' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e8eaf0', marginBottom: 10, lineHeight: 1.2 }}>
                Glossary
              </div>
              <div style={{ fontSize: 13, color: '#a0a8bc', lineHeight: 1.7, flex: 1 }}>
                Definitions for every metric in the platform — formulas, basketball meaning,
                and how each stat connects to performance outcomes.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Formulas', 'Definitions', 'Searchable'].map(tag => (
                  <span key={tag} style={{
                    background: '#1f2537', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#a0a8bc',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Rotation Planner */}
          <a href="/rotations" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #fbbf24',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', letterSpacing: '0.08em' }}>
                  GAME DAY
                </div>
                <span style={{ fontSize: 18, color: '#fbbf24' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e8eaf0', marginBottom: 10, lineHeight: 1.2 }}>
                Rotation Planner
              </div>
              <div style={{ fontSize: 13, color: '#a0a8bc', lineHeight: 1.7, flex: 1 }}>
                Generate optimised pre-game rotations with constraint modelling — starters, closers,
                minimum minutes, position balance, and fewest ref calls.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Min Mins', 'Positions', 'Sub Calls'].map(tag => (
                  <span key={tag} style={{
                    background: '#1f2537', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#fbbf24',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Player Profiles */}
          <a href="/players/c1000000-0000-0000-0000-000000000001" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #f59e0b',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', letterSpacing: '0.08em' }}>
                  PLAYER DEVELOPMENT
                </div>
                <span style={{ fontSize: 18, color: '#f59e0b' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e8eaf0', marginBottom: 10, lineHeight: 1.2 }}>
                Player Profiles
              </div>
              <div style={{ fontSize: 13, color: '#a0a8bc', lineHeight: 1.7, flex: 1 }}>
                Individual development profiles for every player. Pillar scores, team ranks,
                AI-generated insights, coaching priorities, and suggested drills.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Insights', 'Work Ons', 'Drills'].map(tag => (
                  <span key={tag} style={{
                    background: '#1f2537', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#fbbf24',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>
        </div>

        {/* ── Season snapshot ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Record',    value: `${wins}–${losses}`,                colour: '#34d399' },
            { label: 'Games',     value: String(games.length),               colour: '#e8eaf0' },
            { label: 'PPG',       value: ppg,                                colour: '#97cfdc' },
            { label: 'Opp PPG',   value: oppPpg,                             colour: '#7a9eb5' },
            { label: 'Pt Diff',   value: `${pointDiff >= 0 ? '+' : ''}${pointDiff}`, colour: pointDiff >= 0 ? '#34d399' : '#f87171' },
          ].map(({ label, value, colour }) => (
            <div key={label} style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: '16px 16px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: colour }}>{value}</div>
              <div style={{ fontSize: 10, color: '#a0a8bc', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Player stats table ── */}
        <PlayerStatsTable players={playerTotals} />

        {/* ── Recent games ── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#97cfdc' }}>RECENT RESULTS</span>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...games].reverse().slice(0, 10).map((g: any) => {
              const date = new Date(g.game_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
              return (
                <a key={g.id} href={`/games/${g.id}`} style={{ textDecoration: 'none' }} className="game-row-link">
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 8,
                    background: '#171c2a', border: `1px solid #3a5a7a`,
                  }}>
                    <span style={{ fontSize: 11, color: '#a0a8bc', width: 60 }}>{date}</span>
                    <span style={{ fontSize: 12, color: '#c5cde0', flex: 1, textAlign: 'center' }}>
                      {g.home_away === 'home' ? 'vs' : '@'} {g.opponent_name}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf0', width: 80, textAlign: 'center' }}>
                      {g.team_score} – {g.opponent_score}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 800, width: 28, textAlign: 'center',
                      color: g.result === 'W' ? '#34d399' : '#f87171',
                    }}>{g.result}</span>
                    <span style={{ fontSize: 10, color: '#5c6880', width: 72, textAlign: 'right', fontWeight: 500 }}>
                      Box Score →
                    </span>
                  </div>
                </a>
              )
            })}
          </div>
        </div>

      </div>
    </main>
  )
}

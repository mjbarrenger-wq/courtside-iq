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

const BG     = '#f4f5f7'
const BORDER = '#e2e5eb'
const CARD   = '#ffffff'
const HEADER = '#ffffff'

export default async function Home() {
  const [gamesRaw, stats, players, drillsRaw] = await Promise.all([
    fetchJson('games?select=*,opponents(full_name)&order=game_date.asc'),
    fetchJson('player_game_stats?select=player_id,points,oreb,dreb,ast,stl,blk,turnovers,ft_made,ft_att,twopt_made,twopt_att,threept_made,threept_att'),
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
    const ftMade    = sum('ft_made'),    ftAtt    = sum('ft_att')
    const twoptMade = sum('twopt_made'), twoptAtt = sum('twopt_att')
    const thryptMade= sum('threept_made'), thryptAtt = sum('threept_att')
    const totalPts  = sum('points')
    const fgMade    = twoptMade + thryptMade
    const fgAtt     = twoptAtt  + thryptAtt
    // TS% = pts / (2 × (FGA + 0.44 × FTA))
    const tsDenom   = 2 * (fgAtt + 0.44 * ftAtt)
    return {
      id:     p.id,
      name:   `${p.first_name} ${p.last_name}`,
      jersey: p.jersey_number,
      gp,
      ppg:    avg('points'),
      rpg:    Math.round(((sum('oreb') + sum('dreb')) / Math.max(gp, 1)) * 10) / 10,
      orpg:   Math.round((sum('oreb') / Math.max(gp, 1)) * 10) / 10,
      drpg:   Math.round((sum('dreb') / Math.max(gp, 1)) * 10) / 10,
      apg:    avg('ast'),
      spg:    avg('stl'),
      bpg:    avg('blk'),
      topg:   avg('turnovers'),
      fg_pct: fgAtt  > 0 ? Math.round((fgMade / fgAtt) * 1000) / 10 : 0,
      ts_pct: tsDenom > 0 ? Math.round((totalPts / tsDenom) * 1000) / 10 : 0,
      ft_pct: ftAtt  > 0 ? Math.round((ftMade  / ftAtt)  * 1000) / 10 : 0,
    }
  })

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 64px',
    }}>

      {/* ── Header ── */}
      <div className="px-4 md:px-8 py-5" style={{ background: HEADER, borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex-wrap gap-3" style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', letterSpacing: '0.05em' }}>
              COURTSIDE IQ
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
              WGT 12.2 · U12 Basketball · Melbourne · Season 2025–26 &nbsp;·&nbsp;
              <span style={{ color: '#307b92', fontWeight: 700 }}>CMD Sports Analytics</span>
            </div>
          </div>
          {/* Season record pills */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{
              background: '#ecfdf5', border: '1px solid #059669', borderRadius: 20,
              padding: '4px 14px', fontSize: 13, fontWeight: 700, color: '#059669',
            }}>{wins}–{losses}</span>
            <span style={{
              background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20,
              padding: '4px 14px', fontSize: 13, fontWeight: 700,
              color: pointDiff >= 0 ? '#059669' : '#dc2626',
            }}>{pointDiff >= 0 ? '+' : ''}{pointDiff} PTS</span>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-8" style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Nav cards ── */}
        {/* One card per nav bar destination (Overview excluded — this page IS Overview), */}
        {/* ordered to match the nav bar sequence. Phone: 1 col. Small tablet: 2 cols. Desktop (md+): 5 across, 2 rows. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-5 mb-10">

          {/* Driver Tree */}
          <a href="/dashboard" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #307b92',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#307b92', letterSpacing: '0.08em' }}>
                  COACHING INTELLIGENCE
                </div>
                <span style={{ fontSize: 18, color: '#307b92' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', marginBottom: 10, lineHeight: 1.2 }}>
                Value Driver Tree
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                Net PPP decomposition across 8 performance pillars. Understand what's driving wins and
                losses — shot efficiency, possession control, defensive pressure, and more.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Net PPP', 'Driver Scores', 'AI Priorities'].map(tag => (
                  <span key={tag} style={{
                    background: '#eef1f6', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#307b92',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Quadrants */}
          <a href="/players" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #307b92',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#307b92', letterSpacing: '0.08em' }}>
                  PLAYER ANALYSIS
                </div>
                <span style={{ fontSize: 18, color: '#307b92' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', marginBottom: 10, lineHeight: 1.2 }}>
                Player Quadrants
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                Offensive vs Defensive PPP for every player. Identify two-way contributors,
                specialists, and development priorities. Filter by game window or date range.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Off/Def PPP', 'Quadrant Map', 'So What?'].map(tag => (
                  <span key={tag} style={{
                    background: '#eef1f6', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#307b92',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* CIQ Leaderboard */}
          <a href="/ciq" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #307b92',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#307b92', letterSpacing: '0.08em' }}>
                  PLAYER VALUE
                </div>
                <span style={{ fontSize: 18, color: '#307b92' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', marginBottom: 10, lineHeight: 1.2 }}>
                CIQ Leaderboard
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                The roster ranked by Courtside IQ Rating — our single value metric, points of value
                per 100 possessions blending box production with on-court impact. Best and worst games,
                and each player&rsquo;s trend across the season.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Season CIQ', 'Value Rank', 'Trend'].map(tag => (
                  <span key={tag} style={{
                    background: '#eef1f6', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#307b92',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Profiles */}
          <a href="/profiles" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #f59e0b',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', letterSpacing: '0.08em' }}>
                  PLAYER DEVELOPMENT
                </div>
                <span style={{ fontSize: 18, color: '#d97706' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', marginBottom: 10, lineHeight: 1.2 }}>
                Player Profiles
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                Individual development profiles for every player. Select a player from the quadrant
                view to see pillar scores, team ranks, AI insights, and drill recommendations.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Insights', 'Work Ons', 'Drills'].map(tag => (
                  <span key={tag} style={{
                    background: '#fffbeb', border: `1px solid #fcd34d`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#d97706',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Debriefs */}
          <a href="/debriefs" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #8b5cf6',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.08em' }}>
                  GAME RECAPS
                </div>
                <span style={{ fontSize: 18, color: '#7c3aed' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', marginBottom: 10, lineHeight: 1.2 }}>
                Game Debriefs
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                Every game on the schedule with an AI coaching narrative, pillar-by-pillar breakdown,
                and full box score. Filter by result or game type.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['AI Narrative', 'Box Scores', 'All Games'].map(tag => (
                  <span key={tag} style={{
                    background: '#f5f3ff', border: `1px solid #ddd6fe`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#7c3aed',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Trends */}
          <a href="/trends" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #38bdf8',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', letterSpacing: '0.08em' }}>
                  SEASON ANALYTICS
                </div>
                <span style={{ fontSize: 18, color: '#0284c7' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', marginBottom: 10, lineHeight: 1.2 }}>
                Season Trends
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                Chart any stat across the season — PPP, shooting, rebounds, and more — for the team
                or an individual player, filtered by game type.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Stat Trends', 'Player View', 'Filters'].map(tag => (
                  <span key={tag} style={{
                    background: '#f0f9ff', border: `1px solid #bae6fd`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#0284c7',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Practice */}
          <a href="/practice" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #10b981',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', letterSpacing: '0.08em' }}>
                  TRAINING TOOLS
                </div>
                <span style={{ fontSize: 18, color: '#059669' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', marginBottom: 10, lineHeight: 1.2 }}>
                Practice Builder
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                AI-generated 60 or 90-minute session plans built around your team's current weakest
                pillars, with structured blocks and coaching cues.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['AI Sessions', '60/90 Min', 'Pillar-Targeted'].map(tag => (
                  <span key={tag} style={{
                    background: '#ecfdf5', border: `1px solid #a7f3d0`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#059669',
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
                <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', letterSpacing: '0.08em' }}>
                  TRAINING TOOLS
                </div>
                <span style={{ fontSize: 18, color: '#059669' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', marginBottom: 10, lineHeight: 1.2 }}>
                Drills Library
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                {drillCount} drills across all 8 driver pillars — ranked by your team's current performance
                data. Worst-performing areas surface first.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[`${drillCount} Drills`, 'Data-Ranked', 'All Pillars'].map(tag => (
                  <span key={tag} style={{
                    background: '#ecfdf5', border: `1px solid #a7f3d0`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#059669',
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
                <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', letterSpacing: '0.08em' }}>
                  GAME DAY
                </div>
                <span style={{ fontSize: 18, color: '#d97706' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', marginBottom: 10, lineHeight: 1.2 }}>
                Rotation Planner
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                Generate optimised pre-game rotations with constraint modelling — starters, closers,
                minimum minutes, position balance, and fewest ref calls.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Min Mins', 'Positions', 'Sub Calls'].map(tag => (
                  <span key={tag} style={{
                    background: '#fffbeb', border: `1px solid #fcd34d`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#d97706',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>

          {/* Game Config */}
          <a href="/games" style={{ textDecoration: 'none', display: 'flex' }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderTop: '3px solid #8b5cf6',
              borderRadius: 14, padding: '28px 28px 24px',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.08em' }}>
                  ADMIN
                </div>
                <span style={{ fontSize: 18, color: '#7c3aed' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', marginBottom: 10, lineHeight: 1.2 }}>
                Game Config
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                Assign game type, round, venue, and opponent details for every game — the source data
                behind the Type filters used across the platform.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Game Type', 'Bulk Edit', 'Setup'].map(tag => (
                  <span key={tag} style={{
                    background: '#f5f3ff', border: `1px solid #ddd6fe`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#7c3aed',
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
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.08em' }}>
                  REFERENCE
                </div>
                <span style={{ fontSize: 18, color: '#6b7280' }}>→</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', marginBottom: 10, lineHeight: 1.2 }}>
                Glossary
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                Definitions for every metric in the platform — formulas, basketball meaning,
                and how each stat connects to performance outcomes.
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Formulas', 'Definitions', 'Searchable'].map(tag => (
                  <span key={tag} style={{
                    background: '#eef1f6', border: `1px solid ${BORDER}`,
                    borderRadius: 20, padding: '3px 10px', fontSize: 10,
                    fontWeight: 600, color: '#6b7280',
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          </a>
        </div>

        {/* ── Season snapshot ── */}
        {/* Phone: 2 cols (was a forced 5-wide row that spilled off-screen). Desktop: 5. */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { label: 'Record',    value: `${wins}–${losses}`,                colour: '#059669' },
            { label: 'Games',     value: String(games.length),               colour: '#1a1f2e' },
            { label: 'PPG',       value: ppg,                                colour: '#307b92' },
            { label: 'Opp PPG',   value: oppPpg,                             colour: '#6b7280' },
            { label: 'Pt Diff',   value: `${pointDiff >= 0 ? '+' : ''}${pointDiff}`, colour: pointDiff >= 0 ? '#059669' : '#dc2626' },
          ].map(({ label, value, colour }) => (
            <div key={label} style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: '16px 16px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: colour }}>{value}</div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Player stats table ── */}
        <PlayerStatsTable players={playerTotals} />

        {/* ── Recent games ── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#307b92' }}>RECENT RESULTS</span>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...games].reverse().slice(0, 10).map((g: any) => {
              const date = new Date(g.game_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
              return (
                <a key={g.id} href={`/games/${g.id}`} style={{ textDecoration: 'none' }} className="game-row-link">
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 8, gap: 8, flexWrap: 'wrap',
                    background: '#f8f9fb', border: `1px solid ${BORDER}`,
                  }}>
                    <span style={{ fontSize: 11, color: '#6b7280', width: 60, flexShrink: 0 }}>{date}</span>
                    <span style={{
                      fontSize: 12, color: '#374151', flex: 1, minWidth: 60, textAlign: 'center',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {g.home_away === 'home' ? 'vs' : '@'} {g.opponent_name}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1f2e', width: 80, textAlign: 'center', flexShrink: 0 }}>
                      {g.team_score} – {g.opponent_score}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 800, width: 28, textAlign: 'center', flexShrink: 0,
                      color: g.result === 'W' ? '#059669' : '#dc2626',
                    }}>{g.result}</span>
                    <span style={{ fontSize: 10, color: '#6b7280', width: 72, textAlign: 'right', fontWeight: 500, flexShrink: 0 }}>
                      Game Debrief →
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

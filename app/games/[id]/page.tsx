export const dynamic = 'force-dynamic'

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function fetchJson(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: 'no-store',
  })
  return res.json()
}

function fmtMins(secs: number): string {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function pct(made: number, att: number): string {
  if (!att) return '—'
  return `${Math.round((made / att) * 100)}%`
}

// ── Layout constants ──────────────────────────────────────────────────────────
const BG     = '#f4f5f7'
const BORDER = '#e2e5eb'
const CARD   = '#ffffff'
const HEADER = '#ffffff'

export default async function BoxScorePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [gameRaw, playerStatsRaw, playersRaw] = await Promise.all([
    fetchJson(`games?id=eq.${id}&select=*,opponents(full_name)&limit=1`),
    fetchJson(`player_game_stats?game_id=eq.${id}&select=*`),
    fetchJson(`players?select=id,first_name,last_name,jersey_number&order=jersey_number.asc`),
  ])

  const game   = Array.isArray(gameRaw) && gameRaw.length > 0 ? gameRaw[0] : null
  const pStats = Array.isArray(playerStatsRaw) ? playerStatsRaw : []
  const players: any[] = Array.isArray(playersRaw) ? playersRaw : []

  if (!game) {
    return (
      <main style={{ background: BG, minHeight: '100vh', color: '#1a1f2e', fontFamily: "'Inter', system-ui, sans-serif", padding: 40 }}>
        <p style={{ color: '#6b7280' }}>Game not found.</p>
        <a href="/" style={{ color: '#307b92', fontSize: 12 }}>← Back to overview</a>
      </main>
    )
  }

  const opponentName = game.opponents?.full_name ?? 'Unknown'
  const gameDate = new Date(game.game_date).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const isWin    = game.result === 'W'
  const homeAway = game.home_away === 'home' ? 'vs' : '@'

  interface BoxRow {
    id: string; name: string; jersey: number; mins: string
    pts: number; fgm: number; fga: number
    tpm: number; tpa: number; ftm: number; fta: number
    reb: number; oreb: number; dreb: number
    ast: number; stl: number; blk: number; to: number
    pm: number | null
  }

  // Build per-player rows — only players who appeared in this game
  const rows: BoxRow[] = (players as any[])
    .map((p: any): BoxRow | null => {
      const s = (pStats as any[]).find((r: any) => r.player_id === p.id)
      if (!s) return null
      return {
        id:     p.id,
        name:   `${p.first_name} ${p.last_name}`,
        jersey: p.jersey_number,
        mins:   fmtMins(s.time_played_seconds || 0),
        pts:    s.points        || 0,
        fgm:    (s.twopt_made  || 0) + (s.threept_made || 0),
        fga:    (s.twopt_att   || 0) + (s.threept_att  || 0),
        tpm:    s.threept_made  || 0,
        tpa:    s.threept_att   || 0,
        ftm:    s.ft_made       || 0,
        fta:    s.ft_att        || 0,
        reb:    (s.oreb || 0) + (s.dreb || 0),
        oreb:   s.oreb          || 0,
        dreb:   s.dreb          || 0,
        ast:    s.ast           || 0,
        stl:    s.stl           || 0,
        blk:    s.blk           || 0,
        to:     s.turnovers     || 0,
        pm:     s.plus_minus != null ? s.plus_minus : null,
      }
    })
    .filter((r): r is BoxRow => r !== null)

  // Sort: descending points, then FGA as tiebreak
  rows.sort((a: BoxRow, b: BoxRow) => b.pts - a.pts || b.fga - a.fga)

  // Team totals
  const sum = (key: keyof BoxRow) =>
    rows.reduce((s: number, r: BoxRow) => s + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0)

  const totals = {
    pts: sum('pts'), fgm: sum('fgm'), fga: sum('fga'),
    tpm: sum('tpm'), tpa: sum('tpa'),
    ftm: sum('ftm'), fta: sum('fta'),
    reb: sum('reb'), ast: sum('ast'),
    stl: sum('stl'), blk: sum('blk'),
    to:  sum('to'),
  }

  const columns = [
    { key: 'player',  label: 'Player',   align: 'left'   },
    { key: 'mins',    label: 'MIN',      align: 'center' },
    { key: 'pts',     label: 'PTS',      align: 'center' },
    { key: 'fg',      label: 'FGM-FGA',  align: 'center' },
    { key: 'fg_pct',  label: 'FG%',      align: 'center' },
    { key: 'tp',      label: '3PM-3PA',  align: 'center' },
    { key: 'ft',      label: 'FTM-FTA',  align: 'center' },
    { key: 'ft_pct',  label: 'FT%',      align: 'center' },
    { key: 'reb',     label: 'REB',      align: 'center' },
    { key: 'ast',     label: 'AST',      align: 'center' },
    { key: 'stl',     label: 'STL',      align: 'center' },
    { key: 'blk',     label: 'BLK',      align: 'center' },
    { key: 'to',      label: 'TO',       align: 'center' },
    { key: 'pm',      label: '+/-',      align: 'center' },
  ] as const

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 64px',
    }}>

      {/* ── Header ── */}
      <div style={{ background: HEADER, borderBottom: `1px solid ${BORDER}`, padding: '16px 32px' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>

          {/* Breadcrumb */}
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
            <a href="/" style={{ color: '#6b7280', textDecoration: 'none' }}>Overview</a>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ color: '#307b92' }}>Box Score</span>
          </div>

          {/* Game headline */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                WGT 12.2 · {gameDate}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1f2e' }}>
                WGT 12.2 &nbsp;
                <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 16 }}>{homeAway}</span>
                &nbsp; {opponentName}
              </div>
            </div>

            {/* Final score */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: isWin ? '#059669' : '#dc2626', lineHeight: 1 }}>
                  {game.team_score}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', marginTop: 2 }}>WGT</div>
              </div>
              <div style={{ fontSize: 22, color: '#6b7280', fontWeight: 300 }}>–</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#6b7280', lineHeight: 1 }}>
                  {game.opponent_score}
                </div>
                <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', marginTop: 2 }}>OPP</div>
              </div>
              <div style={{
                marginLeft: 8,
                background: isWin ? '#ecfdf5' : '#fef2f2',
                border: `1px solid ${isWin ? '#059669' : '#dc2626'}`,
                borderRadius: 8, padding: '6px 14px',
                fontSize: 15, fontWeight: 800,
                color: isWin ? '#059669' : '#dc2626',
              }}>{isWin ? 'WIN' : 'LOSS'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Box score ── */}
      <div style={{ maxWidth: 1060, margin: '28px auto', padding: '0 32px' }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>

          {/* Section label */}
          <div style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#307b92' }}>BOX SCORE — WGT 12.2</span>
            <span style={{ fontSize: 10, color: '#6b7280' }}>
              {rows.length} players · click a player to view their development profile
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr style={{ background: '#f0f2f7' }}>
                  {/* Player col */}
                  <th style={{
                    padding: '9px 14px', textAlign: 'left',
                    fontSize: 10, fontWeight: 700, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    borderBottom: `1px solid ${BORDER}`,
                    position: 'sticky', left: 0, background: '#f0f2f7', zIndex: 1,
                  }}>Player</th>

                  {columns.slice(1).map(col => (
                    <th key={col.key} style={{
                      padding: '9px 12px', textAlign: 'center',
                      fontSize: 10, fontWeight: 700, color: '#6b7280',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap',
                    }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: BoxRow, i: number) => {
                  const pmColour = r.pm == null ? '#6b7280' : r.pm > 0 ? '#059669' : r.pm < 0 ? '#dc2626' : '#374151'
                  const pmDisplay = r.pm == null ? '—' : r.pm > 0 ? `+${r.pm}` : String(r.pm)
                  return (
                    <tr key={r.id} style={{
                      background: i % 2 === 0 ? 'transparent' : '#f8f9fb',
                    }}>
                      {/* Player cell — sticky + linked */}
                      <td style={{
                        padding: '9px 14px',
                        borderBottom: `1px solid ${BORDER}`,
                        position: 'sticky', left: 0,
                        background: i % 2 === 0 ? CARD : '#f8f9fb',
                        zIndex: 1,
                        whiteSpace: 'nowrap',
                      }}>
                        <a href={`/players/${r.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: '#6b7280', width: 24 }}>#{r.jersey}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{r.name}</span>
                        </a>
                      </td>

                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: '#6b7280', borderBottom: `1px solid ${BORDER}` }}>{r.mins}</td>

                      {/* PTS — highlighted */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#1a1f2e', borderBottom: `1px solid ${BORDER}` }}>{r.pts}</td>

                      {/* FGM-FGA */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: '#374151', borderBottom: `1px solid ${BORDER}` }}>
                        {r.fgm}-{r.fga}
                      </td>
                      {/* FG% */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 11, color: '#6b7280', borderBottom: `1px solid ${BORDER}` }}>
                        {pct(r.fgm, r.fga)}
                      </td>

                      {/* 3PM-3PA */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: '#374151', borderBottom: `1px solid ${BORDER}` }}>
                        {r.tpm}-{r.tpa}
                      </td>

                      {/* FTM-FTA */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: '#374151', borderBottom: `1px solid ${BORDER}` }}>
                        {r.ftm}-{r.fta}
                      </td>
                      {/* FT% */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 11, color: '#6b7280', borderBottom: `1px solid ${BORDER}` }}>
                        {pct(r.ftm, r.fta)}
                      </td>

                      {/* REB with OReb/DReb breakdown on hover via title */}
                      <td title={`OReb: ${r.oreb}  DReb: ${r.dreb}`} style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#307b92', borderBottom: `1px solid ${BORDER}`, cursor: 'default' }}>
                        {r.reb}
                      </td>

                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: '#374151', borderBottom: `1px solid ${BORDER}` }}>{r.ast}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: '#374151', borderBottom: `1px solid ${BORDER}` }}>{r.stl}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: '#374151', borderBottom: `1px solid ${BORDER}` }}>{r.blk}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: r.to > 4 ? '#dc2626' : '#374151', borderBottom: `1px solid ${BORDER}` }}>{r.to}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: pmColour, borderBottom: `1px solid ${BORDER}` }}>{pmDisplay}</td>
                    </tr>
                  )
                })}

                {/* ── Team totals row ── */}
                <tr style={{ background: '#f0f2f7', borderTop: `2px solid ${BORDER}` }}>
                  <td style={{
                    padding: '10px 14px', fontSize: 11, fontWeight: 700,
                    color: '#307b92', letterSpacing: '0.06em',
                    position: 'sticky', left: 0, background: '#f0f2f7',
                  }}>TEAM TOTALS</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#6b7280' }}>—</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#1a1f2e' }}>{totals.pts}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#374151' }}>{totals.fgm}-{totals.fga}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#6b7280' }}>{pct(totals.fgm, totals.fga)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#374151' }}>{totals.tpm}-{totals.tpa}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#374151' }}>{totals.ftm}-{totals.fta}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#6b7280' }}>{pct(totals.ftm, totals.fta)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#307b92' }}>{totals.reb}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#374151' }}>{totals.ast}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#374151' }}>{totals.stl}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#374151' }}>{totals.blk}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#374151' }}>{totals.to}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#6b7280' }}>—</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div style={{ padding: '10px 20px', borderTop: `1px solid ${BORDER}`, fontSize: 10, color: '#6b7280' }}>
            REB hover shows offensive / defensive split · TO highlighted red when &gt; 4 · Click any player name to view their development profile
          </div>
        </div>
      </div>
    </main>
  )
}

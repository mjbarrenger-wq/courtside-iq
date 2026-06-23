import { Suspense } from 'react'
import { getSeasonAggregates } from '@/lib/getSeasonAggregates'
import { computeDriverTree } from '@/lib/driverTree'
import GameDebrief, { DebriefSkeleton } from './GameDebrief'

export const dynamic = 'force-dynamic'

const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'
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

function signStr(n: number, decimals = 2): string {
  const s = n.toFixed(decimals)
  return n >= 0 ? `+${s}` : s
}

// ── Layout constants ──────────────────────────────────────────────────────────
const BG     = '#f4f5f7'
const BORDER = '#e2e5eb'
const CARD   = '#ffffff'
const HEADER = '#ffffff'
const TEAL   = '#307b92'
const SEC    = '#374151'
const MUTED  = '#6b7280'
const GREEN  = '#059669'
const RED    = '#dc2626'

const PILLAR_COLORS: Record<string, string> = {
  'Shot Efficiency':     '#307b92',
  'Possession Control':  '#307b92',
  'Second Chances':      '#1e6a82',
  'Rim Pressure':        '#d97706',
  'Shot Suppression':    '#059669',
  'Possession Ending':   '#059669',
  'Possession Creation': '#d97706',
  'Discipline':          '#dc2626',
}

const PILLAR_SIDE: Record<string, string> = {
  'Shot Efficiency':     'OFF',
  'Possession Control':  'OFF',
  'Second Chances':      'OFF',
  'Rim Pressure':        'OFF',
  'Shot Suppression':    'DEF',
  'Possession Ending':   'DEF',
  'Possession Creation': 'DEF',
  'Discipline':          'DEF',
}

export default async function BoxScorePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [gameRaw, playerStatsRaw, playersRaw, gameAggs, seasonAggs] = await Promise.all([
    fetchJson(`games?id=eq.${id}&select=*,opponents(full_name)&limit=1`),
    fetchJson(`player_game_stats?game_id=eq.${id}&select=*`),
    fetchJson(`players?select=id,first_name,last_name,jersey_number&order=jersey_number.asc`),
    getSeasonAggregates(TEAM_ID, [id]),
    getSeasonAggregates(TEAM_ID),
  ])

  const game   = Array.isArray(gameRaw) && gameRaw.length > 0 ? gameRaw[0] : null
  const pStats = Array.isArray(playerStatsRaw) ? playerStatsRaw : []
  const players: any[] = Array.isArray(playersRaw) ? playersRaw : []

  if (!game) {
    return (
      <main style={{ background: BG, minHeight: '100vh', color: '#1a1f2e', fontFamily: "'Inter', system-ui, sans-serif", padding: 40 }}>
        <p style={{ color: MUTED }}>Game not found.</p>
      </main>
    )
  }

  const gameTree   = computeDriverTree(gameAggs)
  const seasonTree = computeDriverTree(seasonAggs)

  const opponentName = game.opponents?.full_name ?? 'Unknown'
  const gameDate = new Date(game.game_date).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const isWin    = game.result === 'W'
  const homeAway = game.home_away === 'home' ? 'vs' : '@'

  // ── All 8 pillars with vs-season comparison ──────────────────────────────────
  const allGamePillars   = [...gameTree.pillars.offensive, ...gameTree.pillars.defensive]
  const allSeasonPillars = [...seasonTree.pillars.offensive, ...seasonTree.pillars.defensive]
  const pillarComparisons = allGamePillars.map(gp => {
    const sp = allSeasonPillars.find(p => p.name === gp.name)
    const seasonDelta = sp?.delta ?? 0
    return {
      name:        gp.name,
      gameDelta:   gp.delta,
      seasonDelta,
      vsAvg:       +(gp.delta - seasonDelta).toFixed(2),
    }
  })

  // ── Top 3 contributors ───────────────────────────────────────────────────────
  interface ContribRow {
    id: string; name: string; jersey: number
    pts: number; ast: number; stl: number; blk: number; to: number
    impact: number
  }
  const contributors: ContribRow[] = (players as any[])
    .map((p: any): ContribRow | null => {
      const s = (pStats as any[]).find((r: any) => r.player_id === p.id)
      if (!s) return null
      const pts = s.points || 0
      const ast = s.ast || 0
      const stl = s.stl || 0
      const blk = s.blk || 0
      const to  = s.turnovers || 0
      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        jersey: p.jersey_number,
        pts, ast, stl, blk, to,
        impact: pts + (ast + stl + blk) * 0.5 - to * 0.75,
      }
    })
    .filter((r): r is ContribRow => r !== null)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3)

  // ── Box score data ───────────────────────────────────────────────────────────
  interface BoxRow {
    id: string; name: string; jersey: number; mins: string
    pts: number; fgm: number; fga: number
    tpm: number; tpa: number; ftm: number; fta: number
    reb: number; oreb: number; dreb: number
    ast: number; stl: number; blk: number; to: number
    pm: number | null
  }

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

  rows.sort((a: BoxRow, b: BoxRow) => b.pts - a.pts || b.fga - a.fga)

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

  const netPppDiff = +(gameTree.net_ppp - seasonTree.net_ppp).toFixed(2)

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
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>
            <a href="/" style={{ color: MUTED, textDecoration: 'none' }}>Overview</a>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ color: TEAL }}>Game Debrief</span>
          </div>

          {/* Game headline */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                WGT 12.2 · {gameDate}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1f2e' }}>
                WGT 12.2 &nbsp;
                <span style={{ color: MUTED, fontWeight: 400, fontSize: 16 }}>{homeAway}</span>
                &nbsp; {opponentName}
              </div>
            </div>

            {/* Final score */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: isWin ? GREEN : RED, lineHeight: 1 }}>
                  {game.team_score}
                </div>
                <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: '0.08em', marginTop: 2 }}>WGT</div>
              </div>
              <div style={{ fontSize: 22, color: MUTED, fontWeight: 300 }}>–</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: MUTED, lineHeight: 1 }}>
                  {game.opponent_score}
                </div>
                <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: '0.08em', marginTop: 2 }}>OPP</div>
              </div>
              <div style={{
                marginLeft: 8,
                background: isWin ? '#ecfdf5' : '#fef2f2',
                border: `1px solid ${isWin ? GREEN : RED}`,
                borderRadius: 8, padding: '6px 14px',
                fontSize: 15, fontWeight: 800,
                color: isWin ? GREEN : RED,
              }}>{isWin ? 'WIN' : 'LOSS'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Debrief content ── */}
      <div style={{ maxWidth: 1060, margin: '24px auto', padding: '0 32px' }}>

        {/* ── Net PPP + Off/Def split ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: 16,
          marginBottom: 20,
          alignItems: 'stretch',
        }}>
          {/* Net PPP card */}
          <div style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            padding: '20px 28px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 140,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Net PPP</div>
            <div style={{
              fontSize: 40,
              fontWeight: 900,
              color: gameTree.net_ppp >= 0 ? GREEN : RED,
              lineHeight: 1,
            }}>
              {gameTree.net_ppp >= 0 ? '+' : ''}{gameTree.net_ppp}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
              season avg: {seasonTree.net_ppp >= 0 ? '+' : ''}{seasonTree.net_ppp}
            </div>
            <div style={{
              marginTop: 10,
              fontSize: 10,
              fontWeight: 700,
              color: netPppDiff >= 0 ? GREEN : RED,
              background: netPppDiff >= 0 ? '#ecfdf5' : '#fef2f2',
              border: `1px solid ${netPppDiff >= 0 ? '#86efac' : '#fca5a5'}`,
              borderRadius: 99,
              padding: '3px 10px',
            }}>
              {netPppDiff >= 0 ? '▲' : '▼'} vs avg: {signStr(netPppDiff)}
            </div>
          </div>

          {/* Off / Def PPP split */}
          <div style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            padding: '20px 28px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
          }}>
            {/* Offence */}
            <div style={{ paddingRight: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Offence</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: '#1a1f2e', lineHeight: 1 }}>{gameTree.off_ppp}</span>
                <span style={{ fontSize: 11, color: MUTED }}>Off PPP</span>
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>season avg: {seasonTree.off_ppp}</div>
              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>vs avg</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: gameTree.off_ppp >= seasonTree.off_ppp ? GREEN : RED }}>
                    {signStr(+(gameTree.off_ppp - seasonTree.off_ppp).toFixed(2))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Pace</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: SEC }}>{gameTree.pace}</div>
                </div>
              </div>
            </div>

            {/* Defence */}
            <div style={{ borderLeft: `1px solid ${BORDER}`, paddingLeft: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Defence</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: '#1a1f2e', lineHeight: 1 }}>{gameTree.def_ppp}</span>
                <span style={{ fontSize: 11, color: MUTED }}>Def PPP</span>
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>season avg: {seasonTree.def_ppp}</div>
              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>vs avg</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: gameTree.def_ppp <= seasonTree.def_ppp ? GREEN : RED }}>
                    {signStr(+(gameTree.def_ppp - seasonTree.def_ppp).toFixed(2))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Opp Off PPP</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: gameTree.opp_off_ppp <= seasonTree.opp_off_ppp ? GREEN : RED }}>
                    {gameTree.opp_off_ppp}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Pillar snapshot grid ── */}
        <div style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          overflow: 'hidden',
          marginBottom: 20,
        }}>
          <div style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: TEAL }}>DRIVER BREAKDOWN — THIS GAME</span>
            <span style={{ fontSize: 10, color: MUTED }}>▲/▼ shows performance vs season average</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {pillarComparisons.map((p, i) => {
              const color      = PILLAR_COLORS[p.name] ?? TEAL
              const side       = PILLAR_SIDE[p.name] ?? 'OFF'
              const aboveAvg   = p.vsAvg >= 0
              const pillarPos  = p.gameDelta >= 0
              const col        = i % 4
              const row        = Math.floor(i / 4)
              return (
                <div
                  key={p.name}
                  style={{
                    padding: '16px 18px',
                    borderRight: col < 3 ? `1px solid ${BORDER}` : 'none',
                    borderBottom: row === 0 ? `1px solid ${BORDER}` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: SEC, flex: 1 }}>{p.name}</span>
                    <span style={{
                      fontSize: 8, fontWeight: 700,
                      color: side === 'OFF' ? TEAL : GREEN,
                      background: side === 'OFF' ? '#e8f4f8' : '#ecfdf5',
                      border: `1px solid ${side === 'OFF' ? '#93c5d7' : '#86efac'}`,
                      borderRadius: 3, padding: '1px 5px',
                    }}>{side}</span>
                  </div>

                  <div style={{ fontSize: 22, fontWeight: 900, color: pillarPos ? GREEN : RED, lineHeight: 1, marginBottom: 3 }}>
                    {signStr(p.gameDelta)}
                  </div>
                  <div style={{ fontSize: 9, color: MUTED, marginBottom: 8 }}>this game</div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: MUTED }}>{signStr(p.seasonDelta)} avg</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: aboveAvg ? GREEN : RED,
                      background: aboveAvg ? '#ecfdf5' : '#fef2f2',
                      border: `1px solid ${aboveAvg ? '#86efac' : '#fca5a5'}`,
                      borderRadius: 99, padding: '1px 6px',
                    }}>
                      {aboveAvg ? '▲' : '▼'} {signStr(p.vsAvg)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Top Contributors ── */}
        {contributors.length > 0 && (
          <div style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            overflow: 'hidden',
            marginBottom: 20,
          }}>
            <div style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEAL }}>TOP CONTRIBUTORS</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {contributors.map((c, i) => (
                <a
                  key={c.id}
                  href={`/players/${c.id}`}
                  style={{
                    padding: '16px 20px',
                    borderRight: i < 2 ? `1px solid ${BORDER}` : 'none',
                    textDecoration: 'none',
                    display: 'block',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 7,
                      background: i === 0 ? '#1a1f2e' : BG,
                      border: `1px solid ${i === 0 ? '#1a1f2e' : BORDER}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800,
                      color: i === 0 ? '#ffffff' : MUTED,
                      flexShrink: 0,
                    }}>
                      #{c.jersey}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1f2e' }}>{c.name}</div>
                      {i === 0 && <div style={{ fontSize: 9, fontWeight: 700, color: TEAL, letterSpacing: '0.08em' }}>GAME LEADER</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[
                      { label: 'PTS', val: c.pts, highlight: true },
                      { label: 'AST', val: c.ast },
                      { label: 'STL', val: c.stl },
                      { label: 'TO',  val: c.to, bad: true },
                    ].map(stat => (
                      <div key={stat.label}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: stat.bad && c.to > 3 ? RED : stat.highlight ? '#1a1f2e' : SEC, lineHeight: 1 }}>{stat.val}</div>
                        <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginTop: 2 }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── AI Coaching Debrief (Suspense) ── */}
        <Suspense fallback={<DebriefSkeleton />}>
          <GameDebrief
            opponentName={opponentName}
            isWin={isWin}
            teamScore={game.team_score}
            oppScore={game.opponent_score}
            gameDate={gameDate}
            gameTree={gameTree}
            seasonTree={seasonTree}
          />
        </Suspense>

        {/* ── Box score ── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>

          <div style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: TEAL }}>BOX SCORE — WGT 12.2</span>
            <span style={{ fontSize: 10, color: MUTED }}>
              {rows.length} players · click a player to view their development profile
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr style={{ background: '#f0f2f7' }}>
                  <th style={{
                    padding: '9px 14px', textAlign: 'left',
                    fontSize: 10, fontWeight: 700, color: MUTED,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    borderBottom: `1px solid ${BORDER}`,
                    position: 'sticky', left: 0, background: '#f0f2f7', zIndex: 1,
                  }}>Player</th>

                  {columns.slice(1).map(col => (
                    <th key={col.key} style={{
                      padding: '9px 12px', textAlign: 'center',
                      fontSize: 10, fontWeight: 700, color: MUTED,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap',
                    }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: BoxRow, i: number) => {
                  const pmColour  = r.pm == null ? MUTED : r.pm > 0 ? GREEN : r.pm < 0 ? RED : SEC
                  const pmDisplay = r.pm == null ? '—' : r.pm > 0 ? `+${r.pm}` : String(r.pm)
                  return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : '#f8f9fb' }}>
                      <td style={{
                        padding: '9px 14px',
                        borderBottom: `1px solid ${BORDER}`,
                        position: 'sticky', left: 0,
                        background: i % 2 === 0 ? CARD : '#f8f9fb',
                        zIndex: 1, whiteSpace: 'nowrap',
                      }}>
                        <a href={`/players/${r.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: MUTED, width: 24 }}>#{r.jersey}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: SEC }}>{r.name}</span>
                        </a>
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: MUTED, borderBottom: `1px solid ${BORDER}` }}>{r.mins}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#1a1f2e', borderBottom: `1px solid ${BORDER}` }}>{r.pts}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: SEC, borderBottom: `1px solid ${BORDER}` }}>{r.fgm}-{r.fga}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 11, color: MUTED, borderBottom: `1px solid ${BORDER}` }}>{pct(r.fgm, r.fga)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: SEC, borderBottom: `1px solid ${BORDER}` }}>{r.tpm}-{r.tpa}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: SEC, borderBottom: `1px solid ${BORDER}` }}>{r.ftm}-{r.fta}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 11, color: MUTED, borderBottom: `1px solid ${BORDER}` }}>{pct(r.ftm, r.fta)}</td>
                      <td title={`OReb: ${r.oreb}  DReb: ${r.dreb}`} style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: TEAL, borderBottom: `1px solid ${BORDER}`, cursor: 'default' }}>{r.reb}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: SEC, borderBottom: `1px solid ${BORDER}` }}>{r.ast}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: SEC, borderBottom: `1px solid ${BORDER}` }}>{r.stl}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: SEC, borderBottom: `1px solid ${BORDER}` }}>{r.blk}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, color: r.to > 4 ? RED : SEC, borderBottom: `1px solid ${BORDER}` }}>{r.to}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: pmColour, borderBottom: `1px solid ${BORDER}` }}>{pmDisplay}</td>
                    </tr>
                  )
                })}

                {/* Team totals */}
                <tr style={{ background: '#f0f2f7', borderTop: `2px solid ${BORDER}` }}>
                  <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: TEAL, letterSpacing: '0.06em', position: 'sticky', left: 0, background: '#f0f2f7' }}>TEAM TOTALS</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: MUTED }}>—</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#1a1f2e' }}>{totals.pts}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: SEC }}>{totals.fgm}-{totals.fga}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: MUTED }}>{pct(totals.fgm, totals.fga)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: SEC }}>{totals.tpm}-{totals.tpa}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: SEC }}>{totals.ftm}-{totals.fta}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: MUTED }}>{pct(totals.ftm, totals.fta)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: TEAL }}>{totals.reb}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: SEC }}>{totals.ast}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: SEC }}>{totals.stl}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: SEC }}>{totals.blk}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: SEC }}>{totals.to}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: MUTED }}>—</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ padding: '10px 20px', borderTop: `1px solid ${BORDER}`, fontSize: 10, color: MUTED }}>
            REB hover shows offensive / defensive split · TO highlighted red when &gt; 4 · Click any player name to view their development profile
          </div>
        </div>
      </div>
    </main>
  )
}

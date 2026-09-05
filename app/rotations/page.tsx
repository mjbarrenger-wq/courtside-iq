// Rotation Planner — Server Component
// Fetches players + their performance data, renders RotationPlanner client component

import type { Metadata } from 'next'
import RotationPlanner from './RotationPlanner'
import LineupPerformance, { type LineupRow } from './LineupPerformance'
import { listRotationPlans } from './actions'
import type { RotationPlayer, GameOption, Position } from './types'
import { fetchRows } from '@/lib/supabaseRest'
import type { PlayerRow, PlayerGameStatsRow, GameRow, OpponentRow, LineupStintRow } from '@/lib/dbTypes'

const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'

type StatRow  = Pick<PlayerGameStatsRow, 'player_id' | 'points' | 'oreb' | 'dreb' | 'turnovers' | 'ft_att' | 'twopt_att' | 'threept_att'>
type StintRow = Pick<LineupStintRow, 'game_id' | 'seconds' | 'player_ids' | 'pf' | 'pa' | 'off_poss' | 'def_poss'>

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Rotation Planner — Courtside IQ' }

const BG     = '#f4f5f7'
const BORDER = '#e2e5eb'
const HEADER = '#ffffff'

export default async function RotationsPage() {
  const [playerRows, statRows, gameRows, opponentRows, stintArr, plans] = await Promise.all([
    fetchRows<PlayerRow>(`players?select=*&order=jersey_number.asc`),
    fetchRows<StatRow>(`player_game_stats?select=player_id,points,oreb,dreb,turnovers,ft_att,twopt_att,threept_att`),
    fetchRows<Pick<GameRow, 'id' | 'game_date' | 'opponent_id'>>(`games?select=id,game_date,opponent_id&team_id=eq.${TEAM_ID}&order=game_date.desc`),
    fetchRows<Pick<OpponentRow, 'id' | 'full_name'>>(`opponents?select=id,full_name`),
    fetchRows<StintRow>(`lineup_stints?select=game_id,seconds,player_ids,pf,pa,off_poss,def_poss&team_id=eq.${TEAM_ID}`),
    listRotationPlans(TEAM_ID),
  ])

  const opponentName: Record<string, string> = Object.fromEntries(
    opponentRows.map(o => [o.id, o.full_name]),
  )
  const games: GameOption[] = gameRows
    .map(g => {
      const d = g.game_date ? new Date(g.game_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''
      const opp = opponentName[g.opponent_id ?? ''] ?? 'Unknown'
      return { id: g.id, label: [d, opp].filter(Boolean).join(' — ') }
    })

  const players: RotationPlayer[] = playerRows
    .map(p => {
      const rows = statRows.filter(r => r.player_id === p.id)
      // Basic PPP approximation from available stats
      // TODO: use getSeasonAggregates for proper Off/Def PPP once available per player
      const pts = rows.reduce((s, r) => s + (r.points || 0), 0)
      const poss = rows.reduce((s, r) =>
        s + (r.twopt_att || 0) + (r.threept_att || 0) + 0.44 * (r.ft_att || 0) + (r.turnovers || 0), 0)
      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        firstName: p.first_name,
        jersey: p.jersey_number ?? 0,
        primaryPositions: (p.primary_positions ?? []) as Position[],
        secondaryPositions: (p.secondary_positions ?? []) as Position[],
        offPpp: poss > 0 ? Math.round((pts / poss) * 1000) / 1000 : undefined,
      }
    })

  // ── Lineup performance (from imported play-by-play / lineup_stints) ──────────
  const pInfo: Record<string, { first: string; jersey: number }> = Object.fromEntries(
    playerRows.map(p => [p.id, { first: p.first_name, jersey: p.jersey_number ?? 999 }]),
  )
  const gamesWithPbp = new Set(stintArr.map(s => s.game_id)).size
  const agg: Record<string, { ids: string[]; secs: number; pf: number; pa: number; op: number; dp: number }> = {}
  for (const s of stintArr) {
    const ids: string[] = Array.isArray(s.player_ids) ? s.player_ids : []
    const key = [...ids].sort().join('|')
    if (!key) continue
    const a = (agg[key] ||= { ids, secs: 0, pf: 0, pa: 0, op: 0, dp: 0 })
    a.secs += Number(s.seconds) || 0
    a.pf += s.pf || 0; a.pa += s.pa || 0
    a.op += Number(s.off_poss) || 0; a.dp += Number(s.def_poss) || 0
  }
  const lineupRows: LineupRow[] = Object.values(agg).map((a) => {
    const off = a.op > 0 ? a.pf / a.op : 0
    const def = a.dp > 0 ? a.pa / a.dp : 0
    const names = a.ids
      .map((id) => pInfo[id] ?? { first: '?', jersey: 999 })
      .sort((x, y) => x.jersey - y.jersey)
      .map((p) => p.first)
    return {
      names, minutes: a.secs / 60, plusMinus: a.pf - a.pa,
      offPpp: Math.round(off * 100) / 100, defPpp: Math.round(def * 100) / 100,
      netPpp: Math.round((off - def) * 100) / 100, offPoss: a.op, defPoss: a.dp,
    }
  }).sort((x, y) => y.minutes - x.minutes)

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 64px',
    }}>
      {/* Header */}
      <div style={{ background: HEADER, borderBottom: `1px solid ${BORDER}`, padding: '16px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1f2e', letterSpacing: '0.05em' }}>
            ROTATION PLANNER
          </div>
          <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
            WGT 12.2 — pre-game lineup builder &nbsp;·&nbsp;
            <span style={{ color: '#307b92', fontWeight: 700 }}>CMD Sports Analytics</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 0' }}>
        {/* Page title */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#307b92', letterSpacing: '0.08em', marginBottom: 6 }}>
            ROTATION PLANNER
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1a1f2e', margin: 0, lineHeight: 1.2 }}>
            Pre-Game Rotations
          </h1>
          <p style={{ fontSize: 14, color: '#4b5563', marginTop: 8, lineHeight: 1.6, maxWidth: 600 }}>
            Set player constraints, generate an optimised rotation plan, and adjust until it fits your game plan.
            The planner respects starter/closer roles, minimum minutes, position balance, and minimises referee sub calls.
          </p>
        </div>

        <RotationPlanner players={players} teamId={TEAM_ID} games={games} initialPlans={plans} />

        <LineupPerformance rows={lineupRows} gameCount={gamesWithPbp} totalGames={games.length} />
      </div>
    </main>
  )
}

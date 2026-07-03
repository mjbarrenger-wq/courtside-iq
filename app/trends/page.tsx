import { Suspense } from 'react'
import type { Metadata } from 'next'
import { TrendChart, type GamePoint } from './TrendChart'
import { STAT_CATEGORIES, getStatCategory, type StatKey } from './statCategories'
import { StatCategoryMenu } from './StatCategoryMenu'
import { FilterBar } from '../dashboard/FilterBar'
import type { FilterKey, GameTypeKey } from '../dashboard/filterConfig'
import { FILTER_CONFIG, GAME_TYPE_CONFIG } from '../dashboard/filterConfig'
import { PlayerSelector, type PlayerOption } from '../dashboard/PlayerSelector'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Season Trend — Courtside IQ' }

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

const BG     = '#f4f5f7'
const CARD   = '#ffffff'
const BORDER = '#e2e5eb'

// ── Filter helper (same pattern as dashboard/players/players[id]) ──────────────
function applyFilter(allGames: any[], filter: FilterKey): any[] {
  const sorted = [...allGames].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime()
  )
  switch (filter) {
    case 'last5':       return sorted.slice(-5)
    case 'last10':      return sorted.slice(-10)
    case 'wins':        return sorted.filter(g => g.result === 'W')
    case 'losses':      return sorted.filter(g => g.result === 'L')
    case 'close_games': return sorted.filter(g =>
      g.team_score != null && g.opponent_score != null &&
      Math.abs(g.team_score - g.opponent_score) < 6
    )
    default:            return sorted
  }
}

function pct(made: number, att: number): number {
  return att > 0 ? Math.round((made / att) * 1000) / 10 : 0
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; type?: string; player?: string; stat?: string }>
}) {
  const {
    filter: rawFilter = 'all',
    type:   rawType   = 'all_types',
    player: playerId,
    stat:   rawStat    = 'ppp',
  } = await searchParams

  const filter   = (FILTER_CONFIG.some(f => f.key === rawFilter) ? rawFilter : 'all') as FilterKey
  const gameType = (GAME_TYPE_CONFIG.some(t => t.key === rawType) ? rawType : 'all_types') as GameTypeKey

  const [gamesRaw, playersRaw] = await Promise.all([
    fetchJson(`games?team_id=eq.${TEAM_ID}&select=id,game_date,result,team_score,opponent_score,game_type,opponents(full_name)&order=game_date.asc`),
    fetchJson(`players?team_id=eq.${TEAM_ID}&select=id,first_name,last_name,jersey_number&order=jersey_number.asc`),
  ])

  const allGames = Array.isArray(gamesRaw) ? gamesRaw : []
  const allPlayers: PlayerOption[] = (Array.isArray(playersRaw) ? playersRaw : []).map((p: any) => ({
    id: p.id, name: `${p.first_name} ${p.last_name}`, jersey: p.jersey_number,
  }))
  const selectedPlayer = playerId ? allPlayers.find(p => p.id === playerId) : undefined

  // View + Type filters applied on top of the full season
  let filteredGames = applyFilter(allGames, filter)
  if (gameType !== 'all_types') {
    filteredGames = filteredGames.filter((g: any) => g.game_type === gameType)
  }

  const gameIds = filteredGames.map((g: any) => g.id)
  const idList  = gameIds.length ? `(${gameIds.join(',')})` : null

  // Box-score categories are only computed at team level. If a player is
  // selected and the URL still points at a team-only stat, fall back to 'ppp'.
  const requestedCat = STAT_CATEGORIES.some(c => c.key === rawStat) ? (rawStat as StatKey) : 'ppp'
  const category: StatKey = (playerId && getStatCategory(requestedCat).teamOnly) ? 'ppp' : requestedCat

  // ── Per-game data, branch on team vs player mode ──────────────────────────────
  const pppByGame: Record<string, { off: number | null; def: number | null; net: number | null }> = {}
  const boxByGame:  Record<string, {
    ppg: number; toPct: number; efg: number; reb: number; ast: number; stl: number; blk: number; ftPct: number
  }> = {}

  if (playerId) {
    const rows = idList
      ? await fetchJson(`player_game_stats?select=game_id,off_ppp,def_ppp,net_ppp&player_id=eq.${playerId}&game_id=in.${idList}`)
      : []
    if (Array.isArray(rows)) {
      for (const r of rows) {
        pppByGame[r.game_id] = {
          off: r.off_ppp != null ? Number(r.off_ppp) : null,
          def: r.def_ppp != null ? Number(r.def_ppp) : null,
          net: r.net_ppp != null ? Number(r.net_ppp) : null,
        }
      }
    }
  } else if (idList) {
    const [oppStatsRaw, statRows] = await Promise.all([
      fetchJson(`opponent_game_stats?select=game_id,opp_off_ppp,opp_def_ppp&game_id=in.${idList}`),
      fetchJson(`player_game_stats?select=game_id,twopt_made,twopt_att,threept_made,threept_att,ft_made,ft_att,turnovers,ast,oreb,dreb,stl,blk&game_id=in.${idList}`),
    ])

    if (Array.isArray(oppStatsRaw)) {
      for (const r of oppStatsRaw) {
        // opp_def_ppp = how well they defended us = our Off PPP
        // opp_off_ppp = how well they attacked us = our Def PPP
        const off = r.opp_def_ppp != null ? Number(r.opp_def_ppp) : null
        const def = r.opp_off_ppp != null ? Number(r.opp_off_ppp) : null
        pppByGame[r.game_id] = {
          off, def,
          net: off != null && def != null ? Math.round((off - def) * 1000) / 1000 : null,
        }
      }
    }

    if (Array.isArray(statRows)) {
      const sums: Record<string, any> = {}
      for (const r of statRows) {
        if (!sums[r.game_id]) {
          sums[r.game_id] = { twopt_made:0, twopt_att:0, threept_made:0, threept_att:0,
            ft_made:0, ft_att:0, turnovers:0, ast:0, oreb:0, dreb:0, stl:0, blk:0 }
        }
        const s = sums[r.game_id]
        s.twopt_made   += r.twopt_made   || 0
        s.twopt_att    += r.twopt_att    || 0
        s.threept_made += r.threept_made || 0
        s.threept_att  += r.threept_att  || 0
        s.ft_made      += r.ft_made      || 0
        s.ft_att       += r.ft_att       || 0
        s.turnovers    += r.turnovers    || 0
        s.ast          += r.ast          || 0
        s.oreb         += r.oreb         || 0
        s.dreb         += r.dreb         || 0
        s.stl          += r.stl          || 0
        s.blk          += r.blk          || 0
      }
      for (const gameId of Object.keys(sums)) {
        const s = sums[gameId]
        const fga = s.twopt_att + s.threept_att
        const game = filteredGames.find((g: any) => g.id === gameId)
        boxByGame[gameId] = {
          ppg:   game?.team_score ?? 0,
          toPct: pct(s.turnovers, fga + 0.44 * s.ft_att + s.turnovers),
          efg:   pct(s.twopt_made + 1.5 * s.threept_made, fga),
          reb:   s.oreb + s.dreb,
          ast:   s.ast,
          stl:   s.stl,
          blk:   s.blk,
          ftPct: pct(s.ft_made, s.ft_att),
        }
      }
    }
  }

  const gamePoints: GamePoint[] = filteredGames.map((g: any, i: number) => {
    const ppp = pppByGame[g.id]
    const box = boxByGame[g.id]
    return {
      index:     i,
      gameId:    g.id,
      date:      g.game_date,
      opponent:  g.opponents?.full_name ?? 'Unknown',
      result:    g.result as 'W' | 'L',
      teamScore: g.team_score ?? 0,
      oppScore:  g.opponent_score ?? 0,
      offPpp: ppp?.off ?? null,
      defPpp: ppp?.def ?? null,
      netPpp: ppp?.net ?? null,
      ppg:    box?.ppg ?? null,
      toPct:  box?.toPct ?? null,
      efg:    box?.efg ?? null,
      reb:    box?.reb ?? null,
      ast:    box?.ast ?? null,
      stl:    box?.stl ?? null,
      blk:    box?.blk ?? null,
      ftPct:  box?.ftPct ?? null,
    }
  })

  const wins   = filteredGames.filter((g: any) => g.result === 'W').length
  const losses = filteredGames.filter((g: any) => g.result === 'L').length

  // First half vs second half split — generalised to whichever stat is selected
  const withData = category === 'ppp'
    ? gamePoints.filter(g => g.netPpp != null)
    : gamePoints.filter(g => g[category] != null)
  const mid        = Math.floor(withData.length / 2)
  const firstHalf  = withData.slice(0, mid)
  const secondHalf = withData.slice(withData.length - mid)

  function halfAvg(arr: GamePoint[], key: keyof GamePoint) {
    const valid = arr.filter(g => g[key] != null)
    if (valid.length === 0) return null
    return Math.round((valid.reduce((s, g) => s + (g[key] as number), 0) / valid.length) * 1000) / 1000
  }

  const pppSplitMetrics = [
    { label: 'Off PPP', key: 'offPpp' as const, color: '#307b92', higherBetter: true,  format: 'num' as const },
    { label: 'Def PPP', key: 'defPpp' as const, color: '#e05555', higherBetter: false, format: 'num' as const },
    { label: 'Net PPP', key: 'netPpp' as const, color: '#059669', higherBetter: true,  format: 'num' as const },
  ]
  const singleCat = getStatCategory(category)
  const singleSplitMetric = category !== 'ppp'
    ? [{ label: singleCat.label, key: category as keyof GamePoint, color: singleCat.color, higherBetter: singleCat.higherBetter, format: singleCat.format }]
    : []
  const splitMetrics = category === 'ppp' ? pppSplitMetrics : singleSplitMetric

  const fmtSplit = (v: number, format: 'ppp' | 'pct' | 'num') => format === 'pct' ? `${v.toFixed(1)}%` : v.toFixed(2)

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 48px',
    }}>

      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '12px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1f2e', letterSpacing: '0.05em' }}>
              SEASON TREND
            </div>
            <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
              WGT 12.2 — {selectedPlayer ? `#${selectedPlayer.jersey} ${selectedPlayer.name} · ` : ''}
              {filteredGames.length} games · {wins}W {losses}L &nbsp;·&nbsp;
              <span style={{ color: '#307b92', fontWeight: 700 }}>CMD Sports Analytics</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Suspense fallback={<div style={{ width: 200, height: 28 }} />}>
              <FilterBar current={filter} currentType={gameType} />
            </Suspense>
            <Suspense fallback={<div style={{ width: 190, height: 28 }} />}>
              <StatCategoryMenu current={category} playerSelected={!!playerId} />
            </Suspense>
            <Suspense fallback={<div style={{ width: 160, height: 28 }} />}>
              <PlayerSelector players={allPlayers} currentPlayerId={playerId} basePath="/trends" />
            </Suspense>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Main chart card */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '24px 28px', marginBottom: 20 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1f2e' }}>
              {category === 'ppp' ? 'PPP by Game' : singleCat.label + ' by Game'}
              {selectedPlayer ? ` — ${selectedPlayer.name}` : ' — Full Season'}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
              hover any game for details · dashed lines show 3-game rolling average
            </div>
          </div>
          <TrendChart games={gamePoints} category={category} />
        </div>

        {/* First half vs second half */}
        {mid >= 3 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1f2e', marginBottom: 12 }}>
              Season Trajectory
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${splitMetrics.length}, 1fr)`, gap: 12 }}>
              {splitMetrics.map(m => {
                const f = halfAvg(firstHalf, m.key)
                const s = halfAvg(secondHalf, m.key)
                if (f == null || s == null) return null
                const diff      = Math.round((s - f) * 1000) / 1000
                const tol       = m.format === 'pct' ? 0.5 : 0.005
                const improving = m.higherBetter ? diff > tol : diff < -tol
                const declining = m.higherBetter ? diff < -tol : diff > tol
                return (
                  <div key={m.key} style={{
                    background: CARD, border: `1px solid ${BORDER}`,
                    borderTop: `3px solid ${m.color}`,
                    borderRadius: 12, padding: '18px 20px',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: m.color, letterSpacing: '0.06em', marginBottom: 12 }}>
                      {m.label}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>First {mid} games</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: '#1a1f2e', lineHeight: 1 }}>
                          {fmtSplit(f, m.format)}
                        </div>
                      </div>
                      <div style={{ fontSize: 20, color: '#d1d5db', alignSelf: 'center' }}>→</div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>Last {mid} games</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: '#1a1f2e', lineHeight: 1 }}>
                          {fmtSplit(s, m.format)}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, textAlign: 'center', borderRadius: 6, padding: '5px 10px',
                      color:      improving ? '#059669' : declining ? '#dc2626' : '#6b7280',
                      background: improving ? '#ecfdf5' : declining ? '#fef2f2' : '#f4f5f7',
                      border:     `1px solid ${improving ? '#a7f3d0' : declining ? '#fca5a5' : '#e2e5eb'}`,
                    }}>
                      {improving ? '↑ Improving' : declining ? '↓ Declining' : '→ Stable'}
                      &nbsp;
                      <span style={{ fontWeight: 400 }}>
                        ({diff >= 0 ? '+' : ''}{fmtSplit(diff, m.format)})
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}

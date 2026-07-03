import { SeasonAggregates } from './driverTree'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function fetchJson(path: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
    cache: 'no-store'
  })
  return res.json()
}

function emptyAggregates(): SeasonAggregates {
  return {
    pts: 0, possessions: 0, twopt_made: 0, twopt_att: 0, threept_made: 0, threept_att: 0,
    ft_made: 0, ft_att: 0, turnovers: 0, off_fouls: 0, oreb: 0, dreb: 0, total_reb: 0,
    ast: 0, ftf: 0, stl: 0, blk: 0, def_fouls: 0, plus_minus: 0, vps: 0, games: 0,
    opp_pts: 0, opp_possessions: 0, opp_twopt_made: 0, opp_twopt_att: 0,
    opp_threept_made: 0, opp_threept_att: 0, opp_ft_made: 0, opp_ft_att: 0,
    opp_turnovers: 0, opp_oreb: 0, opp_dreb: 0, opp_def_fouls: 0,
    opp_ast: 0, opp_stl: 0, opp_blk: 0,
  }
}

export async function getSeasonAggregates(
  teamId: string,
  gameIds?: string[]   // omit entirely for no filter; pass [] to mean "matched zero games"
): Promise<SeasonAggregates> {

  // IMPORTANT: `gameIds === undefined` means "no filter, fetch every team game" —
  // that's the intentional shortcut callers use. `gameIds` as an explicit EMPTY
  // ARRAY means "a filter was applied and it matched nothing", which must NOT
  // fall back to fetching the whole team. These used to be conflated (both read
  // as `hasFilter = false`), so a Type filter with zero matching games silently
  // showed the full season instead of a blank/zero result.
  const isFiltered = gameIds !== undefined
  if (isFiltered && gameIds.length === 0) {
    return emptyAggregates()
  }

  const idList = isFiltered ? `(${gameIds!.join(',')})` : null

  // Fetch games first so we always have game IDs for the player/opp stat queries
  const games = await fetchJson(
    isFiltered
      ? `games?id=in.${idList}&select=*`
      : `games?team_id=eq.${teamId}&select=*`
  )

  const gameIdList = `(${(Array.isArray(games) ? games : []).map((g: any) => g.id).join(',')})`

  const [playerStats, oppStats] = await Promise.all([
    fetchJson(`player_game_stats?game_id=in.${gameIdList}&select=*`),
    fetchJson(`opponent_game_stats?game_id=in.${gameIdList}&select=*`),
  ])

  const g = games.length

  // ── Our team offensive aggregates ──────────────────────────────────────────
  const pts          = playerStats.reduce((s: number, r: any) => s + (r.points || 0), 0)
  const twopt_made   = playerStats.reduce((s: number, r: any) => s + (r.twopt_made || 0), 0)
  const twopt_att    = playerStats.reduce((s: number, r: any) => s + (r.twopt_att || 0), 0)
  const threept_made = playerStats.reduce((s: number, r: any) => s + (r.threept_made || 0), 0)
  const threept_att  = playerStats.reduce((s: number, r: any) => s + (r.threept_att || 0), 0)
  const ft_made      = playerStats.reduce((s: number, r: any) => s + (r.ft_made || 0), 0)
  const ft_att       = playerStats.reduce((s: number, r: any) => s + (r.ft_att || 0), 0)
  const turnovers    = playerStats.reduce((s: number, r: any) => s + (r.turnovers || 0), 0)
  const off_fouls    = playerStats.reduce((s: number, r: any) => s + (r.off_fouls || 0), 0)
  const oreb         = playerStats.reduce((s: number, r: any) => s + (r.oreb || 0), 0)
  const dreb         = playerStats.reduce((s: number, r: any) => s + (r.dreb || 0), 0)
  const total_reb    = oreb + dreb
  const ast          = playerStats.reduce((s: number, r: any) => s + (r.ast || 0), 0)
  const stl          = playerStats.reduce((s: number, r: any) => s + (r.stl || 0), 0)
  const blk          = playerStats.reduce((s: number, r: any) => s + (r.blk || 0), 0)
  const def_fouls    = playerStats.reduce((s: number, r: any) => s + (r.def_fouls || 0), 0)
  const plus_minus   = playerStats.reduce((s: number, r: any) => s + (r.plus_minus || 0), 0)

  // VPS: use unweighted per-player average so each player counts equally
  // (weighted sum / total rows would over-represent players with more games)
  const playerVpsMap: Record<string, { sum: number; count: number }> = {}
  for (const r of playerStats) {
    const pid = r.player_id
    if (!pid) continue
    if (!playerVpsMap[pid]) playerVpsMap[pid] = { sum: 0, count: 0 }
    playerVpsMap[pid].sum += r.vps || 0
    playerVpsMap[pid].count++
  }
  const playerVpsAvgs = Object.values(playerVpsMap)
    .filter(p => p.count > 0)
    .map(p => p.sum / p.count)
  // Scale by total rows so tppg(vps) = unweighted_avg (tppg divides by total rows)
  const vps = playerVpsAvgs.length > 0
    ? (playerVpsAvgs.reduce((s, v) => s + v, 0) / playerVpsAvgs.length) * playerStats.length
    : playerStats.reduce((s: number, r: any) => s + (r.vps || 0), 0)
  const ftf          = ft_att

  const fga         = twopt_att + threept_att
  const possessions = fga + 0.44 * ft_att - oreb + turnovers

  const opp_pts = games.reduce((s: number, g: any) => s + (g.opponent_score || 0), 0)

  // ── Opponent stats ─────────────────────────────────────────────────────────
  const hasOppData = Array.isArray(oppStats) && oppStats.length > 0

  let opp_twopt_made: number, opp_twopt_att: number
  let opp_threept_made: number, opp_threept_att: number
  let opp_ft_made: number, opp_ft_att: number
  let opp_turnovers: number, opp_oreb: number, opp_dreb: number
  let opp_def_fouls: number, opp_possessions: number, opp_ast: number
  let opp_stl: number, opp_blk: number

  if (hasOppData) {
    opp_twopt_made   = oppStats.reduce((s: number, r: any) => s + (r.opp_twopt_made || 0), 0)
    opp_twopt_att    = oppStats.reduce((s: number, r: any) => s + (r.opp_twopt_att || 0), 0)
    opp_threept_made = oppStats.reduce((s: number, r: any) => s + (r.opp_threept_made || 0), 0)
    opp_threept_att  = oppStats.reduce((s: number, r: any) => s + (r.opp_threept_att || 0), 0)
    opp_ft_made      = oppStats.reduce((s: number, r: any) => s + (r.opp_ft_made || 0), 0)
    opp_ft_att       = oppStats.reduce((s: number, r: any) => s + (r.opp_ft_att || 0), 0)
    opp_turnovers    = oppStats.reduce((s: number, r: any) => s + (r.opp_turnovers || 0), 0)
    opp_oreb         = oppStats.reduce((s: number, r: any) => s + (r.opp_oreb || 0), 0)
    opp_dreb         = oppStats.reduce((s: number, r: any) => s + (r.opp_dreb || 0), 0)
    opp_def_fouls    = oppStats.reduce((s: number, r: any) => s + (r.opp_def_fouls || 0), 0)
    opp_possessions  = oppStats.reduce((s: number, r: any) => s + (r.opp_possessions || 0), 0)
    opp_ast          = oppStats.reduce((s: number, r: any) => s + (r.opp_ast || 0), 0)
    opp_stl          = oppStats.reduce((s: number, r: any) => s + (r.opp_stl || 0), 0)
    opp_blk          = oppStats.reduce((s: number, r: any) => s + (r.opp_blk || 0), 0)
  } else {
    console.log('⚠️  Using hardcoded opponent estimates')
    opp_twopt_made   = g * 31.9
    opp_twopt_att    = g * 42.2
    opp_threept_made = g * 0.3
    opp_threept_att  = g * 1.5
    opp_ft_made      = g * 12.2
    opp_ft_att       = g * 16.7
    opp_turnovers    = g * 16.2
    opp_oreb         = g * 10.6
    opp_dreb         = g * 12.4
    opp_def_fouls    = g * 12.6
    opp_possessions  = possessions
    opp_ast          = 0
    opp_stl          = 0
    opp_blk          = 0
  }

  return {
    pts, possessions, twopt_made, twopt_att, threept_made, threept_att,
    ft_made, ft_att, turnovers, off_fouls, oreb, total_reb, ast, ftf,
    games: g,
    opp_pts, opp_possessions, opp_twopt_made, opp_twopt_att,
    opp_threept_made, opp_threept_att, opp_ft_made, opp_ft_att,
    opp_turnovers, opp_oreb, opp_dreb, opp_def_fouls, dreb,
    stl, blk, def_fouls, plus_minus, vps, opp_ast, opp_stl, opp_blk,
  }
}

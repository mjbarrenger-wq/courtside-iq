import { cache } from 'react'
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

// Only the columns the aggregate actually reads — trimmed from `select=*` (which
// pulled ~56 player columns / 295 KB for a season) down to ~80 KB.
const PLAYER_COLS =
  'player_id,points,twopt_made,twopt_att,threept_made,threept_att,ft_made,ft_att,' +
  'turnovers,off_fouls,oreb,dreb,ast,stl,blk,def_fouls,plus_minus,vps'
const OPP_COLS =
  'opp_twopt_made,opp_twopt_att,opp_threept_made,opp_threept_att,opp_ft_made,opp_ft_att,' +
  'opp_turnovers,opp_oreb,opp_dreb,opp_def_fouls,opp_possessions,opp_ast,opp_stl,opp_blk'
const GAME_COLS = 'id,opponent_score'

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

/**
 * Pure aggregation over already-fetched rows — no I/O. Exported so a page that has
 * already loaded `games` / `player_game_stats` / `opponent_game_stats` for a set of
 * games can build its SeasonAggregates without a second round-trip to Supabase.
 *
 * Single pass over each array (was ~30 separate `.reduce()` passes). Numerics are
 * identical to the previous implementation, including the unweighted-per-player VPS
 * average and the hardcoded opponent estimate fallback.
 */
export function aggregateSeason(
  games: any[], playerStats: any[], oppStats: any[],
): SeasonAggregates {
  const g = games.length

  // ── Our team, one pass (+ per-player VPS map built inline) ──
  let pts = 0, twopt_made = 0, twopt_att = 0, threept_made = 0, threept_att = 0
  let ft_made = 0, ft_att = 0, turnovers = 0, off_fouls = 0, oreb = 0, dreb = 0
  let ast = 0, stl = 0, blk = 0, def_fouls = 0, plus_minus = 0
  const vpsMap: Record<string, { sum: number; count: number }> = {}
  for (const r of playerStats) {
    pts += r.points || 0
    twopt_made += r.twopt_made || 0; twopt_att += r.twopt_att || 0
    threept_made += r.threept_made || 0; threept_att += r.threept_att || 0
    ft_made += r.ft_made || 0; ft_att += r.ft_att || 0
    turnovers += r.turnovers || 0; off_fouls += r.off_fouls || 0
    oreb += r.oreb || 0; dreb += r.dreb || 0
    ast += r.ast || 0; stl += r.stl || 0; blk += r.blk || 0
    def_fouls += r.def_fouls || 0; plus_minus += r.plus_minus || 0
    const pid = r.player_id
    if (pid) {
      const e = (vpsMap[pid] ??= { sum: 0, count: 0 })
      e.sum += r.vps || 0; e.count++
    }
  }
  const total_reb = oreb + dreb

  // VPS: unweighted per-player average, scaled by total rows so a downstream
  // `sum / rows` yields the unweighted average (unchanged from before).
  const playerVpsAvgs = Object.values(vpsMap).filter(p => p.count > 0).map(p => p.sum / p.count)
  const vps = playerVpsAvgs.length > 0
    ? (playerVpsAvgs.reduce((s, v) => s + v, 0) / playerVpsAvgs.length) * playerStats.length
    : playerStats.reduce((s: number, r: any) => s + (r.vps || 0), 0)
  const ftf = ft_att

  const fga = twopt_att + threept_att
  const possessions = fga + 0.44 * ft_att - oreb + turnovers

  const opp_pts = games.reduce((s: number, gm: any) => s + (gm.opponent_score || 0), 0)

  // ── Opponent, one pass (or hardcoded estimate when no opponent rows) ──
  let opp_twopt_made = 0, opp_twopt_att = 0, opp_threept_made = 0, opp_threept_att = 0
  let opp_ft_made = 0, opp_ft_att = 0, opp_turnovers = 0, opp_oreb = 0, opp_dreb = 0
  let opp_def_fouls = 0, opp_possessions = 0, opp_ast = 0, opp_stl = 0, opp_blk = 0

  if (Array.isArray(oppStats) && oppStats.length > 0) {
    for (const r of oppStats) {
      opp_twopt_made += r.opp_twopt_made || 0; opp_twopt_att += r.opp_twopt_att || 0
      opp_threept_made += r.opp_threept_made || 0; opp_threept_att += r.opp_threept_att || 0
      opp_ft_made += r.opp_ft_made || 0; opp_ft_att += r.opp_ft_att || 0
      opp_turnovers += r.opp_turnovers || 0
      opp_oreb += r.opp_oreb || 0; opp_dreb += r.opp_dreb || 0
      opp_def_fouls += r.opp_def_fouls || 0; opp_possessions += r.opp_possessions || 0
      opp_ast += r.opp_ast || 0; opp_stl += r.opp_stl || 0; opp_blk += r.opp_blk || 0
    }
  } else {
    console.log('⚠️  Using hardcoded opponent estimates')
    opp_twopt_made = g * 31.9; opp_twopt_att = g * 42.2
    opp_threept_made = g * 0.3; opp_threept_att = g * 1.5
    opp_ft_made = g * 12.2; opp_ft_att = g * 16.7
    opp_turnovers = g * 16.2; opp_oreb = g * 10.6; opp_dreb = g * 12.4
    opp_def_fouls = g * 12.6; opp_possessions = possessions
    opp_ast = 0; opp_stl = 0; opp_blk = 0
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

/**
 * Fetch + aggregate season totals for a team, optionally restricted to `gameIds`.
 *
 * `gameIds === undefined` → no filter, aggregate every team game. `gameIds === []`
 * → a filter matched zero games (returns zeroes, must NOT fall back to the whole
 * season — the bug this guard exists for).
 *
 * Wrapped in React `cache()` so repeated identical calls within one server request
 * are de-duplicated. When filtered (the common case for game/player pages), the
 * game IDs are already known, so the games/player/opponent fetches run together
 * instead of waterfalling through a games round-trip first.
 */
export const getSeasonAggregates = cache(async (
  teamId: string,
  gameIds?: string[],
): Promise<SeasonAggregates> => {
  const isFiltered = gameIds !== undefined
  if (isFiltered && gameIds.length === 0) return emptyAggregates()

  let games: any[], playerStats: any[], oppStats: any[]

  if (isFiltered) {
    const idList = `(${gameIds!.join(',')})`
    ;[games, playerStats, oppStats] = await Promise.all([
      fetchJson(`games?id=in.${idList}&select=${GAME_COLS}`),
      fetchJson(`player_game_stats?game_id=in.${idList}&select=${PLAYER_COLS}`),
      fetchJson(`opponent_game_stats?game_id=in.${idList}&select=${OPP_COLS}`),
    ])
  } else {
    // Unfiltered: we need the team's game IDs before the stat queries can filter,
    // so this one case still fetches games first.
    games = await fetchJson(`games?team_id=eq.${teamId}&select=${GAME_COLS}`)
    const idList = `(${(Array.isArray(games) ? games : []).map((gm: any) => gm.id).join(',')})`
    ;[playerStats, oppStats] = await Promise.all([
      fetchJson(`player_game_stats?game_id=in.${idList}&select=${PLAYER_COLS}`),
      fetchJson(`opponent_game_stats?game_id=in.${idList}&select=${OPP_COLS}`),
    ])
  }

  return aggregateSeason(
    Array.isArray(games) ? games : [],
    Array.isArray(playerStats) ? playerStats : [],
    Array.isArray(oppStats) ? oppStats : [],
  )
})

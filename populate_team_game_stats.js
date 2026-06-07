/**
 * populate_team_game_stats.js
 *
 * Aggregates player_game_stats per game and upserts into team_game_stats.
 * Also pulls possessions + PPP from opponent_game_stats (where opp_def_ppp
 * is this team's off_ppp, and opp_off_ppp is this team's def_ppp).
 *
 * Prerequisites:
 *   1. Run supabase_team_game_stats_schema.sql in the Supabase SQL editor first.
 *   2. Run from project root: cd ~/Desktop/courtside-iq && node populate_team_game_stats.js
 */

const https = require('https')

const SUPABASE_URL = 'pxefkxtshmuhsuixzgrz.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4ZWZreHRzaG11aHN1aXh6Z3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDg4NTUsImV4cCI6MjA5NTkyNDg1NX0.M4uTveo8RAf-KIRyfVOvhEN4hb65WuHqoeOCR8jn3lU'
const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'

// ── HTTP helpers ───────────────────────────────────────────────────────────────

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const options = {
      hostname: SUPABASE_URL,
      path,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }
    const req = https.request(options, res => {
      let out = ''
      res.on('data', d => out += d)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(out) }) }
        catch { resolve({ status: res.statusCode, body: out }) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

const get  = (path)       => request('GET',  path, null)
const post = (path, body) => request('POST', path, body)

// ── Fetch all player_game_stats ────────────────────────────────────────────────

async function fetchPlayerStats() {
  const res = await get(
    `/rest/v1/player_game_stats?select=*&limit=1000`
  )
  if (res.status !== 200) {
    throw new Error(`Failed to fetch player_game_stats: ${res.status} ${JSON.stringify(res.body)}`)
  }
  console.log(`✓ Fetched ${res.body.length} player_game_stats rows`)
  return res.body
}

// ── Fetch opponent_game_stats for possessions + PPP ───────────────────────────

async function fetchOpponentStats() {
  const res = await get(
    `/rest/v1/opponent_game_stats?team_id=eq.${TEAM_ID}&select=*&limit=100`
  )
  if (res.status !== 200) {
    throw new Error(`Failed to fetch opponent_game_stats: ${res.status} ${JSON.stringify(res.body)}`)
  }
  console.log(`✓ Fetched ${res.body.length} opponent_game_stats rows`)
  // Key by game_id for easy lookup
  const map = {}
  for (const row of res.body) map[row.game_id] = row
  return map
}

// ── Aggregate per game ─────────────────────────────────────────────────────────

function aggregateByGame(playerRows) {
  const games = {}

  for (const row of playerRows) {
    const gid = row.game_id
    if (!games[gid]) {
      games[gid] = {
        game_id:      gid,
        team_id:      TEAM_ID,
        pts:          0,
        twopt_made:   0,
        twopt_att:    0,
        threept_made: 0,
        threept_att:  0,
        ft_made:      0,
        ft_att:       0,
        oreb:         0,
        dreb:         0,
        reb:          0,
        turnovers:    0,
        ast:          0,
        stl:          0,
        blk:          0,
        fouls:        0,
        off_fouls:    0,
        def_fouls:    0,
      }
    }

    const g = games[gid]
    g.pts          += (row.points       || 0)
    g.twopt_made   += (row.twopt_made   || 0)
    g.twopt_att    += (row.twopt_att    || 0)
    g.threept_made += (row.threept_made || 0)
    g.threept_att  += (row.threept_att  || 0)
    g.ft_made      += (row.ft_made      || 0)
    g.ft_att       += (row.ft_att       || 0)
    g.oreb         += (row.oreb         || 0)
    g.dreb         += (row.dreb         || 0)
    g.reb          += (row.reb          || 0)
    g.turnovers    += (row.turnovers    || 0)
    g.ast          += (row.ast          || 0)
    g.stl          += (row.stl          || 0)
    g.blk          += (row.blk          || 0)
    g.fouls        += (row.fouls        || 0)
    g.off_fouls    += (row.off_fouls    || 0)
    g.def_fouls    += (row.def_fouls    || 0)
  }

  return games
}

// ── Compute derived metrics ────────────────────────────────────────────────────

function round2(n) { return Math.round(n * 100) / 100 }

function computeMetrics(g, oppMap) {
  const fga = g.twopt_att + g.threept_att

  // eFG% = (2pm + 1.5 * 3pm) / (2pa + 3pa)
  g.efg_pct = fga > 0
    ? round2((g.twopt_made + 1.5 * g.threept_made) / fga)
    : null

  // TS% = pts / (2 * (fga + 0.44 * fta))
  const tsDenom = 2 * (fga + 0.44 * g.ft_att)
  g.ts_pct = tsDenom > 0 ? round2(g.pts / tsDenom) : null

  // PPP from opponent_game_stats:
  //   opp_def_ppp = this team's off_ppp (what the opponent defended against)
  //   opp_off_ppp = this team's def_ppp (what the opponent scored)
  const opp = oppMap[g.game_id]
  if (opp) {
    g.possessions = opp.opp_possessions  || null
    g.off_ppp     = opp.opp_def_ppp      || null
    g.def_ppp     = opp.opp_off_ppp      || null
    g.net_ppp     = (opp.opp_def_ppp != null && opp.opp_off_ppp != null)
      ? round2(opp.opp_def_ppp - opp.opp_off_ppp)
      : null
  } else {
    g.possessions = null
    g.off_ppp     = null
    g.def_ppp     = null
    g.net_ppp     = null
  }

  return g
}

// ── Upsert ─────────────────────────────────────────────────────────────────────

async function upsert(rows) {
  const res = await post('/rest/v1/team_game_stats', rows)
  if (res.status >= 200 && res.status < 300) {
    console.log(`✓ Upserted ${rows.length} rows into team_game_stats`)
  } else {
    console.error(`✗ Upsert failed: ${res.status}`, JSON.stringify(res.body, null, 2))
  }
}

// ── Verification ───────────────────────────────────────────────────────────────

function verify(games) {
  const totals = Object.values(games).reduce((acc, g) => {
    acc.pts          += g.pts
    acc.oreb         += g.oreb
    acc.dreb         += g.dreb
    acc.reb          += g.reb
    acc.stl          += g.stl
    acc.blk          += g.blk
    acc.turnovers    += g.turnovers
    return acc
  }, { pts: 0, oreb: 0, dreb: 0, reb: 0, stl: 0, blk: 0, turnovers: 0 })

  console.log('\n── Season totals (should match Hoopsalytics ALL row) ──')
  console.log(`  Pts:       ${totals.pts}      (expected: 1239)  ${totals.pts === 1239 ? '✓' : '✗ MISMATCH'}`)
  console.log(`  OReb:      ${totals.oreb}       (expected: 406)   ${totals.oreb === 406 ? '✓' : '✗ MISMATCH'}`)
  console.log(`  DReb:      ${totals.dreb}       (expected: 515)   ${totals.dreb === 515 ? '✓' : '✗ MISMATCH'}`)
  console.log(`  Reb:       ${totals.reb}       (expected: 921)   ${totals.reb === 921 ? '✓' : '✗ MISMATCH'}`)
  console.log(`  Stl:       ${totals.stl}       (expected: 277)   ${totals.stl === 277 ? '✓' : '✗ MISMATCH'}`)
  console.log(`  Blk:       ${totals.blk}        (expected: 66)    ${totals.blk === 66  ? '✓' : '✗ MISMATCH'}`)
  console.log(`  Turnovers: ${totals.turnovers}       (expected: 497)   ${totals.turnovers === 497 ? '✓' : '✗ MISMATCH'}`)
  console.log('')

  const gameCount = Object.keys(games).length
  console.log(`  Games aggregated: ${gameCount} (expected: 29)  ${gameCount === 29 ? '✓' : '✗ MISMATCH'}`)
  console.log('')
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Populating team_game_stats from player_game_stats...\n')

  const [playerRows, oppMap] = await Promise.all([
    fetchPlayerStats(),
    fetchOpponentStats(),
  ])

  const games = aggregateByGame(playerRows)

  for (const gid of Object.keys(games)) {
    computeMetrics(games[gid], oppMap)
  }

  verify(games)

  const rows = Object.values(games)
  await upsert(rows)

  console.log('Done.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

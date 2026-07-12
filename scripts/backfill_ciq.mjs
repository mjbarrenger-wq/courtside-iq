#!/usr/bin/env node
/*
 * backfill_ciq.mjs — populate player_game_stats.ciq_rating for existing games.
 *
 * Computes CIQ Rating through the SAME lib/advancedStats.ciqRating the native
 * finalize uses (single source of truth), for every stored player-game:
 *   • pbp games (29-32)  — on-court context summed from lineup_stints
 *   • box-only games      — pure box, floor time from time_played_seconds
 *
 * player_game_stats has no anon UPDATE policy, so this EMITS SQL on stdout (an
 * `update … from (values …)`), to be run with a privileged connection (Supabase
 * SQL editor / MCP). Diagnostics go to stderr.
 *
 *   node scripts/backfill_ciq.mjs > /tmp/ciq_backfill.sql
 */
import fs from 'fs'
import { ciqRating, seasonCiqBaseline } from '../lib/advancedStats.ts'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const rest = (p) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` } }).then((r) => r.json())

const box = await rest('player_game_stats?select=id,game_id,player_id,points,twopt_att,threept_att,ft_att,turnovers,ast,oreb,dreb,stl,blk,def_fouls,time_played_seconds')
const stints = await rest('lineup_stints?select=game_id,player_ids,pf,pa,off_poss,def_poss')
const games = await rest('games?select=id,season')

// CIQ's scoring baseline is each season's own points-per-play (see
// lib/advancedStats.ts), not a fixed constant — group rows by season and compute
// one baseline per season, so a future second season gets its own rate.
const seasonByGame = Object.fromEntries(games.map((g) => [g.id, g.season ?? 'unknown']))
const rowsBySeason = {}
for (const b of box) (rowsBySeason[seasonByGame[b.game_id] ?? 'unknown'] ??= []).push(b)
const baselineBySeason = Object.fromEntries(
  Object.entries(rowsBySeason).map(([season, rows]) => [season, seasonCiqBaseline(rows)]),
)
console.error(`Season baseline(s): ${JSON.stringify(baselineBySeason)}`)

// on-court context per player-game, summed across their stints
const oc = {}
for (const s of stints) for (const pid of s.player_ids) {
  const k = `${s.game_id}:${pid}`
  const a = (oc[k] ??= { offPoss: 0, defPoss: 0, pf: 0, pa: 0 })
  a.offPoss += +s.off_poss; a.defPoss += +s.def_poss; a.pf += s.pf; a.pa += s.pa
}

const vals = []
let nPbp = 0, nBox = 0, nNull = 0
for (const b of box) {
  if (!b.player_id) continue
  const a = oc[`${b.game_id}:${b.player_id}`] ?? null
  const baseline = baselineBySeason[seasonByGame[b.game_id] ?? 'unknown']
  const ciq = ciqRating(b, a && a.offPoss + a.defPoss > 0 ? a : null, b.time_played_seconds || 0, baseline)
  if (a) nPbp++; else nBox++
  if (ciq == null) { nNull++; vals.push(`('${b.id}'::uuid, null)`) }
  else vals.push(`('${b.id}'::uuid, ${ciq})`)
}

console.error(`Computed CIQ for ${vals.length} rows (${nPbp} with on-court context, ${nBox} box-only, ${nNull} null).`)
console.log('update player_game_stats as p set ciq_rating = v.ciq')
console.log('from (values')
console.log('  ' + vals.join(',\n  '))
console.log(') as v(id, ciq) where p.id = v.id;')

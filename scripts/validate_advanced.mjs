#!/usr/bin/env node
/*
 * validate_advanced.mjs — parity check for lib/advancedStats.ts
 *
 * Replays the stored play-by-play for the imported games (29-32 by default),
 * recomputes the full advanced stat line through the SAME shared module the native
 * finalize uses, and diffs it against the stored Hoopsalytics values.
 *
 *   node scripts/validate_advanced.mjs [game_number ...]
 *
 * Expected result (see the parity note at the top of lib/advancedStats.ts):
 *   • BOX-DERIVED family  — exact (0 mismatches), bar the one known Zach/g30 quirk.
 *   • ON-COURT family     — close, not exact (the export's coarse clock stamps move
 *                           per-player floor time); reported as info, not failure.
 */
import fs from 'fs'
import { aggregateBox } from '../lib/pbpAggregate.ts'
import { computePlayerAdvanced } from '../lib/advancedStats.ts'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }))
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const rest = (p) => fetch(`${SB_URL}/rest/v1/${p}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }).then((r) => r.json())

const nums = process.argv.slice(2).map(Number).filter(Boolean)
const GAME_NUMS = nums.length ? nums : [29, 30, 31, 32]
const gid = (n) => `e1000000-0000-0000-0000-0000000000${n}`

const players = await rest('players?select=id,jersey_number,first_name')
const id2p = Object.fromEntries(players.map((p) => [p.id, p]))

// Families and the tolerance we hold each to. Box-derived is exact (0.05 = display
// rounding only). On-court is reported at a looser band, as info.
// Only the box stats Hoopsalytics actually populates on the imported games are
// validatable. a_to_ratio / ftf / *_per_foul are ours to compute (null target), so
// they are exercised but not diffed here.
const BOX = ['twopt_pct', 'threept_pct', 'ft_pct', 'efg_pct', 'ts_pct', 'to_pct']
const ONCOURT = ['plus_minus', 'off_rtg', 'def_rtg', 'usage_pct', 'reb_pct']

const tally = { box: { checks: 0, miss: 0 }, oncourt: { checks: 0, miss: 0, absErr: 0 } }
const boxProblems = []

for (const n of GAME_NUMS) {
  const g = gid(n)
  const pbp = await rest(`play_by_play?game_id=eq.${g}&select=*&order=event_order`)
  const box = await rest(`player_game_stats?game_id=eq.${g}&select=*`)
  const stints = await rest(`lineup_stints?game_id=eq.${g}&select=*&period&order=id`)
  const boxBy = Object.fromEntries(box.map((b) => [b.player_id, b]))

  const aggEvents = pbp.map((r) => ({
    event_order: r.event_order, period: r.period, event_type: r.event_type,
    team_side: r.team_side, points: r.points ?? 0, player_id: r.player_id,
    clock_sec: r.clock_time != null ? parseFloat(r.clock_time) : null,
    video_time: r.video_time != null ? parseFloat(r.video_time) : null,
  }))
  const firstStint = stints.filter((s) => s.period === 1)[0]
  const starters = firstStint ? [...firstStint.player_ids] : []

  const boxAgg = aggregateBox(aggEvents)
  const adv = computePlayerAdvanced(aggEvents, starters, boxAgg, { timeSource: 'clock' })

  for (const [pid, a] of adv) {
    const db = boxBy[pid]; if (!db) continue
    const p = id2p[pid]; const tag = `g${n} #${p.jersey_number} ${p.first_name}`
    for (const k of BOX) {
      const dbv = db[k] == null ? null : Number(db[k])
      if (dbv == null) continue // no Hoopsalytics value to validate against
      const mine = a[k]
      tally.box.checks++
      if (mine == null || Math.abs(mine - dbv) > 0.051) {
        tally.box.miss++; boxProblems.push(`${tag} ${k}: mine=${mine} db=${dbv}`)
      }
    }
    for (const k of ONCOURT) {
      const mine = a[k], dbv = db[k] == null ? null : Number(db[k])
      if (mine == null || dbv == null) continue
      tally.oncourt.checks++
      const err = Math.abs(mine - dbv)
      tally.oncourt.absErr += err
      if (err > (k === 'plus_minus' ? 0.5 : 0.05)) tally.oncourt.miss++
    }
  }
}

console.log('── BOX-DERIVED (target: exact) ──')
if (boxProblems.length === 0) console.log(`  ✓ ${tally.box.checks} checks, 0 mismatches`)
else { console.log(`  ${tally.box.checks} checks, ${tally.box.miss} mismatches:`); for (const p of boxProblems) console.log('    ' + p) }

const meanErr = tally.oncourt.checks ? (tally.oncourt.absErr / tally.oncourt.checks) : 0
console.log('\n── ON-COURT (our method; close-not-exact on imported games) ──')
console.log(`  ${tally.oncourt.checks} checks, ${tally.oncourt.miss} outside display tolerance, mean abs error ${meanErr.toFixed(2)}`)

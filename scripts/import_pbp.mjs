#!/usr/bin/env node
/*
 * import_pbp.mjs — Courtside IQ play-by-play importer
 *
 * Takes ONE game's Hoopsalytics play-by-play (the on-screen "both teams" paste,
 * where the opponent shows as "Other" and the score column carries a running
 * score) and loads it into Supabase:
 *   - play_by_play   : one row per event (team + opponent), with running score
 *   - lineup_stints  : one row per contiguous on-court 5-man stint, with
 *                      Off/Def/Net PPP (the analytics layer the rotation
 *                      planner + game debrief read)
 *
 * It reconstructs the on-court lineup from the Sub events, then VALIDATES before
 * writing: every "New Lineup" checkpoint in the paste must match the tracked
 * lineup, and the summed points must reconcile to the box score already in the
 * DB (player_game_stats for us, opponent_game_stats for them). On any mismatch
 * it aborts (override with FORCE=1).
 *
 * Usage (from project root):
 *   node scripts/import_pbp.mjs <game_id> <paste_file.txt>
 *   FORCE=1 node scripts/import_pbp.mjs <game_id> <paste_file.txt>   # skip validation gate
 *
 * The paste file is exactly what you copy off the Hoopsalytics play-by-play
 * screen (tabs and all). Single-team CSV exports are NOT supported — they lack
 * opponent events, so defensive/lineup PPP can't be computed.
 *
 * event_type vocabulary written:
 *   made_2pt missed_2pt made_3pt missed_3pt made_ft missed_ft
 *   oreb dreb assist steal block turnover def_foul sub_in sub_out
 */

import fs from 'fs'
import { reconstructStints, stintToRow } from '../lib/pbpAggregate.ts'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL ||
  'https://pxefkxtshmuhsuixzgrz.supabase.co'
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4ZWZreHRzaG11aHN1aXh6Z3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDg4NTUsImV4cCI6MjA5NTkyNDg1NX0.M4uTveo8RAf-KIRyfVOvhEN4hb65WuHqoeOCR8jn3lU'
const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'
const FORCE = process.env.FORCE === '1'
const DRY = process.env.DRY_RUN === '1' // parse + validate counts only, no DB reads/writes
const SQL_OUT = process.env.SQL_OUT === '1' // print SQL to stdout instead of writing via REST (offline)

// Offline jersey->id map (used by DRY_RUN and SQL_OUT, which don't hit the DB).
const J2ID_STATIC = {
  6: 'c1000000-0000-0000-0000-000000000003', 9: 'c1000000-0000-0000-0000-000000000002',
  18: 'c1000000-0000-0000-0000-000000000004', 24: 'c1000000-0000-0000-0000-000000000005',
  26: 'c1000000-0000-0000-0000-000000000006', 38: 'c1000000-0000-0000-0000-000000000001',
  50: 'c1000000-0000-0000-0000-000000000007', 55: 'c1000000-0000-0000-0000-000000000008',
  64: 'c1000000-0000-0000-0000-000000000009', 79: 'c1000000-0000-0000-0000-000000000010',
}

const [, , GAME_ID, FILE] = process.argv
if (!GAME_ID || !FILE) {
  console.error('Usage: node scripts/import_pbp.mjs <game_id> <paste_file.txt>')
  process.exit(1)
}

const rest = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    },
  })
const getJson = (path) => rest(path).then((r) => r.json())

const clkToSec = (c) => {
  const m = String(c).match(/(\d+):(\d+(?:\.\d+)?)/)
  return m ? parseInt(m[1]) * 60 + parseFloat(m[2]) : null
}
// Stint reconstruction, possession math, and secToClk now live in the shared
// lib/pbpAggregate.ts so this importer and the native finalize action stay in
// lock-step. clkToSec above is kept local — it parses the Hoopsalytics "M:SS"
// paste clock, which is a concern of this file's text parser, not aggregation.

// Offline: emit the load SQL instead of writing via REST (used when the runner
// has no network to Supabase). Pipe/copy this into the SQL editor.
function printSql(pbp, stintRows) {
  const out = []
  out.push(`delete from play_by_play where game_id='${GAME_ID}';`)
  out.push(`delete from lineup_stints where game_id='${GAME_ID}';`)
  const pv = pbp.map((r) =>
    `('${GAME_ID}',${r.event_order},${r.period},'${r.clock_time}',${r.player_id ? `'${r.player_id}'` : 'null'},${r.jersey_number ?? 'null'},'${r.event_type}','${r.team_side}',${r.points},${r.team_score},${r.opp_score})`).join(',\n')
  out.push(`insert into play_by_play (game_id,event_order,period,clock_time,player_id,jersey_number,event_type,team_side,points,team_score,opp_score) values\n${pv};`)
  const sv = stintRows.map((s) =>
    `('${GAME_ID}','${TEAM_ID}',${s.period},'${s.start_clock}','${s.end_clock}',${s.seconds},ARRAY[${s.player_ids.map((id) => `'${id}'`).join(',')}]::uuid[],${s.pf},${s.pa},${s.off_poss},${s.def_poss},${s.off_ppp},${s.def_ppp},${s.net_ppp})`).join(',\n')
  out.push(`insert into lineup_stints (game_id,team_id,period,start_clock,end_clock,seconds,player_ids,pf,pa,off_poss,def_poss,off_ppp,def_ppp,net_ppp) values\n${sv};`)
  console.log(out.join('\n'))
}

async function main() {
  // ── Player map: jersey -> id ────────────────────────────────────────────────
  let J2ID
  if (DRY || SQL_OUT) {
    J2ID = J2ID_STATIC // offline modes use the known map
  } else {
    const playersRaw = await getJson(`players?select=id,jersey_number,first_name,last_name`)
    if (!Array.isArray(playersRaw) || !playersRaw.length) {
      console.error('✗ Could not load players from Supabase.'); process.exit(1)
    }
    J2ID = Object.fromEntries(playersRaw.map((p) => [p.jersey_number, p.id]))
  }

  const lines = fs.readFileSync(FILE, 'utf8').split('\n')

  // ── Parse ───────────────────────────────────────────────────────────────────
  const lineup = new Set()
  const starters = [] // jerseys named on the "Starter" lines — the tip-off five
  let q = 0, curClock = 600, ord = 0, ourRun = 0, oppRun = 0
  const pbp = [], checkpoints = []
  const jerseysOf = (set) => [...set].map((s) => +s.match(/#(\d+)/)[1]).sort((a, b) => a - b)
  const ev = (et, jersey, side, pts) => {
    ord++; pbp.push({ event_order: ord, period: q, clock_time: String(curClock),
      player_id: jersey ? J2ID[jersey] : null, jersey_number: jersey ?? null,
      event_type: et, team_side: side, points: pts || 0,
      team_score: ourRun, opp_score: oppRun, game_id: GAME_ID })
  }

  for (const raw of lines) {
    const line = raw.replace(/\t/g, ' ').trim()
    if (!line) continue
    const qm = line.match(/^Q(\d)\s/)
    if (qm) { const nq = +qm[1]; if (nq !== q) q = nq }
    if (line.startsWith('End Quarter')) continue
    const cm = line.match(/^Q\d\s+(\d+:\d+(?:\.\d+)?)/)
    if (cm) curClock = clkToSec(cm[1])

    if (line.startsWith('New Lineup')) {
      const stated = (line.match(/#\d+/g) || []).map((s) => +s.slice(1)).sort((a, b) => a - b).join('-')
      checkpoints.push({ q, stated, tracked: jerseysOf(lineup).join('-') })
      continue
    }
    if (/Starter /.test(line)) {
      const nm = line.match(/Starter (.+?#\d+)/)[1].trim(); lineup.add(nm)
      starters.push(+nm.match(/#(\d+)/)[1]); continue
    }
    if (/Sub IN /.test(line) || /Sub OUT /.test(line)) {
      for (const m of line.matchAll(/Sub IN (.+?#\d+)/g)) { ev('sub_in', +m[1].match(/#(\d+)/)[1], 'team'); lineup.add(m[1].trim()) }
      for (const m of line.matchAll(/Sub OUT (.+?#\d+)/g)) {
        ev('sub_out', +m[1].match(/#(\d+)/)[1], 'team')
        for (const p of [...lineup]) if (p === m[1].trim()) lineup.delete(p)
      }
      continue
    }

    const opp = /by Other/.test(line)
    const jm = opp ? null : line.match(/by (.+?)#(\d+)/)
    const jersey = jm ? +jm[2] : null
    let et = null, pts = 0
    if (/Made 2 Pt/.test(line)) { et = 'made_2pt'; pts = 2 }
    else if (/Missed 2 Pt/.test(line)) et = 'missed_2pt'
    else if (/Made 3 Pt/.test(line)) { et = 'made_3pt'; pts = 3 }
    else if (/Missed 3 Pt/.test(line)) et = 'missed_3pt'
    else if (/Made Free Throws/.test(line)) { et = 'made_ft'; pts = 1 }
    else if (/Missed Free Throws/.test(line)) et = 'missed_ft'
    else if (/Offensive Rebound/.test(line)) et = 'oreb'
    else if (/Defensive Rebound/.test(line)) et = 'dreb'
    else if (/Assist/.test(line)) et = 'assist'
    else if (/Steal/.test(line)) et = 'steal'
    else if (/Block Shot/.test(line)) et = 'block'
    else if (/Turnover/.test(line)) et = 'turnover'
    else if (/Defensive Foul/.test(line)) et = 'def_foul'
    if (!et) continue

    if (pts) { if (opp) oppRun += pts; else ourRun += pts }
    ev(et, jersey, opp ? 'opponent' : 'team', pts)
  }

  // ── Reconstruct stints from the parsed event log ────────────────────────────
  // The shared aggregator replays the ordered events (seeded with the starting
  // five) to rebuild every on-court window and its Off/Def PPP — the same logic
  // the native finalize action uses. clock_time is stored as seconds-remaining.
  const startingLineup = starters.map((j) => J2ID[j]).filter(Boolean)
  const aggEvents = pbp.map((r) => ({ ...r, clock_sec: parseFloat(r.clock_time) }))
  const stints = reconstructStints(aggEvents, startingLineup)

  // ── Validate ────────────────────────────────────────────────────────────────
  const problems = []
  const badCheckpoints = checkpoints.filter((c) => c.stated !== c.tracked)
  if (badCheckpoints.length) problems.push(`${badCheckpoints.length}/${checkpoints.length} lineup checkpoints did not match`)

  const offline = DRY || SQL_OUT
  const ourBox = offline ? null : await getJson(`player_game_stats?select=points&game_id=eq.${GAME_ID}`)
  const oppBox = offline ? null : await getJson(`opponent_game_stats?select=*&game_id=eq.${GAME_ID}`)
  const ourBoxPts = Array.isArray(ourBox) ? ourBox.reduce((s, r) => s + (r.points || 0), 0) : null
  const oppBoxPts = Array.isArray(oppBox) && oppBox[0] && 'points' in oppBox[0] ? oppBox[0].points : null
  if (ourBoxPts != null && ourBoxPts > 0 && ourBoxPts !== ourRun)
    problems.push(`our points ${ourRun} ≠ box score ${ourBoxPts}`)
  if (oppBoxPts != null && oppBoxPts > 0 && oppBoxPts !== oppRun)
    problems.push(`opp points ${oppRun} ≠ box score ${oppBoxPts}`)

  const totalSecs = stints.reduce((a, s) => a + s.seconds, 0)
  // Diagnostics go to stderr so SQL_OUT mode emits clean SQL on stdout.
  console.error(`Parsed: ${pbp.length} events, ${stints.length} stints | score ${ourRun}-${oppRun} | ` +
    `checkpoints ${checkpoints.length - badCheckpoints.length}/${checkpoints.length} ok | stint-secs ${totalSecs}`)
  if (ourBoxPts != null) console.error(`Box score check: our ${ourRun}/${ourBoxPts}, opp ${oppRun}/${oppBoxPts ?? 'n/a'}`)

  if (problems.length) {
    console.error('✗ Validation failed:\n  - ' + problems.join('\n  - '))
    if (!FORCE) { console.error('Aborting. Re-run with FORCE=1 to import anyway.'); process.exit(1) }
    console.error('FORCE=1 set — importing despite the above.')
  }

  const stintRows = stints.map((s) => stintToRow(s, GAME_ID, TEAM_ID))

  if (DRY) { console.log(`✓ DRY_RUN — parsed cleanly, no DB writes. ${stintRows.length} stints would be written.`); return }
  if (SQL_OUT) { printSql(pbp, stintRows); return }

  // ── Write ───────────────────────────────────────────────────────────────────
  await rest(`play_by_play?game_id=eq.${GAME_ID}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  await rest(`lineup_stints?game_id=eq.${GAME_ID}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })

  const ins = async (table, rows) => {
    const r = await rest(table, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rows) })
    if (!r.ok) { console.error(`✗ insert ${table} failed: ${r.status} ${await r.text()}`); process.exit(1) }
  }
  await ins('play_by_play', pbp)
  await ins('lineup_stints', stintRows)

  console.log(`✓ Imported game ${GAME_ID}: ${pbp.length} play_by_play rows, ${stintRows.length} lineup_stints.`)
}

main().catch((e) => { console.error(e); process.exit(1) })

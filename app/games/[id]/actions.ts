'use server'

import { generateAndStoreDebrief, type DebriefResult } from '@/lib/generateDebrief'
import { supabase } from '@/lib/supabase'
import {
  reconstructStints, stintToRow, aggregateBox, sidePossessions, aggregateOpponentByJersey,
  opponentSecondsByJersey, type AggEvent,
} from '@/lib/pbpAggregate'
import { computePlayerAdvanced, playerSecondsFromStints, seasonCiqBaseline } from '@/lib/advancedStats'
import { videoTimeFromClock } from '@/lib/videoAlign'
import type { LocalEvent } from '@/lib/entryState'

// Called by the Regenerate button. Generates a fresh debrief and writes it to
// the database (overwriting the stored copy), then returns the new text.
export async function regenerateGameDebrief(gameId: string): Promise<DebriefResult> {
  return generateAndStoreDebrief(gameId)
}

// ── Native game finalize (STAT_ENTRY.md §4) ─────────────────────────────────

const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'

const r1 = (n: number) => Math.round(n * 10) / 10
const r3 = (n: number) => Math.round(n * 1000) / 1000

export interface FinalizeInput {
  starters: string[]
  events: LocalEvent[]
  finalTeamScore: number
  finalOppScore: number
  // Opponent jerseys on court at tip, for opponent minutes. Optional — when absent,
  // opponent minutes fall back to whatever the sub events alone imply (often none).
  opponentStarters?: number[]
}

export interface FinalizeResult {
  success: boolean
  error?: string
  written?: { play_by_play: number; lineup_stints: number; player_game_stats: number }
  tallied?: { team: number; opp: number }
}

// Delete this game's rows from a table, prove the delete actually cleared them
// (the RLS DELETE gap that silently no-ops is exactly the failure this feature was
// built to avoid — see migrations/add_anon_delete_stat_tables.sql), then insert the
// new rows and confirm every one landed. Returns an error string, or null on success.
async function replaceRows(
  table: string, gameId: string, rows: Record<string, unknown>[],
): Promise<string | null> {
  const del = await supabase.from(table).delete().eq('game_id', gameId)
  if (del.error) return `delete ${table}: ${del.error.message}`

  const { count, error: cErr } = await supabase
    .from(table).select('id', { count: 'exact', head: true }).eq('game_id', gameId)
  if (cErr) return `verify-clear ${table}: ${cErr.message}`
  if (count && count > 0) return `delete ${table} left ${count} rows — RLS DELETE gap on ${table}`

  if (rows.length === 0) return null
  const { data, error } = await supabase.from(table).insert(rows).select('id')
  if (error) return `insert ${table}: ${error.message}`
  if (!data || data.length !== rows.length) {
    return `insert ${table}: wrote ${data?.length ?? 0}/${rows.length} rows — RLS INSERT gap on ${table}`
  }
  return null
}

/**
 * Aggregate a natively-entered event log and write it to every game table, so a
 * natively-scored game is numerically indistinguishable from an imported one.
 *
 * Uses the shared aggregator (reconstructStints / aggregateBox / rollupPlayerOnCourt)
 * — the same math the Hoopsalytics importer runs — in video timeSource, since native
 * games carry YouTube playback positions rather than a game clock. Every write is
 * delete-then-reinsert with affected-row verification; VPS is left null (a
 * Hoopsalytics-proprietary metric that can't be reproduced, §2).
 */
export async function finalizeNativeGame(
  gameId: string, input: FinalizeInput,
): Promise<FinalizeResult> {
  const { starters, events, finalTeamScore, finalOppScore, opponentStarters = [] } = input

  if (!Array.isArray(events) || events.length === 0) {
    return { success: false, error: 'No events to finalize — score the game first.' }
  }
  if (!Array.isArray(starters) || starters.length !== 5) {
    return { success: false, error: 'Starting five is not set — go back to the roster.' }
  }

  // Tallied score from the event log must match the manually-entered final score
  // (the abort-on-mismatch gate, §3). Recomputed here, not trusted from the client.
  const last = events[events.length - 1]
  const talliedTeam = last.team_score
  const talliedOpp = last.opp_score
  if (talliedTeam !== finalTeamScore || talliedOpp !== finalOppScore) {
    return {
      success: false,
      tallied: { team: talliedTeam, opp: talliedOpp },
      error: `Tallied score ${talliedTeam}–${talliedOpp} does not match the entered final ${finalTeamScore}–${finalOppScore}. Fix the events or the final score before finalizing.`,
    }
  }

  const aggEvents: AggEvent[] = events.map(e => ({
    event_order: e.event_order,
    period: e.period,
    event_type: e.event_type,
    team_side: e.team_side,
    points: e.points,
    player_id: e.player_id,
    clock_sec: e.clock_sec,
    video_time: e.video_time,
    jersey_number: e.jersey_number,
  }))

  const box = aggregateBox(aggEvents)
  // The game clock, when the coach ran it, is the authority for game time (it's the
  // one they control and correct); prefer clock_sec over the YouTube timer for stint
  // durations. Fall back to video_time when the clock wasn't used.
  const timeSource = aggEvents.some(e => e.clock_sec != null) ? 'clock' : 'video'
  const stints = reconstructStints(aggEvents, starters, { timeSource })

  // CIQ's scoring baseline is this season's own points-per-play, not a fixed
  // constant (see lib/advancedStats.ts). Derived from every OTHER game already
  // played this season, so this game doesn't skew its own baseline.
  let ciqBaseline: number | undefined
  const { data: gameRow } = await supabase.from('games').select('season').eq('id', gameId).single()
  if (gameRow?.season) {
    const { data: seasonGames } = await supabase.from('games').select('id').eq('season', gameRow.season)
    const seasonGameIds = (seasonGames ?? []).map(g => g.id).filter(id => id !== gameId)
    if (seasonGameIds.length > 0) {
      const { data: seasonRows } = await supabase
        .from('player_game_stats')
        .select('points, twopt_att, threept_att, ft_att, turnovers')
        .in('game_id', seasonGameIds)
      if (seasonRows && seasonRows.length > 0) ciqBaseline = seasonCiqBaseline(seasonRows)
    }
  }

  // Full Hoopsalytics-parity advanced line per player (box-derived exact +
  // pbp-inferred + on-court our-method). See lib/advancedStats.ts for the parity
  // note; this is the same module scripts/validate_advanced.mjs checks vs games 29-32.
  const advanced = computePlayerAdvanced(aggEvents, starters, box, { timeSource, ciqBaseline })

  // Per-player arithmetic guard (§4): points and rebounds must reconcile to the
  // component counts. By construction they will unless the event stream is corrupt,
  // which is exactly what this catches before anything is written.
  for (const [pid, c] of box.players) {
    const expectedPts = 2 * c.twopt_made + 3 * c.threept_made + c.ft_made
    if (c.pts !== expectedPts) {
      return { success: false, error: `Arithmetic check failed for a player: points ${c.pts} ≠ ${expectedPts} from makes.` }
    }
    if (c.reb !== c.oreb + c.dreb) {
      return { success: false, error: `Arithmetic check failed for a player: rebounds ${c.reb} ≠ ${c.oreb}+${c.dreb}.` }
    }
    void pid
  }

  const teamPoss = sidePossessions(box.team)
  const oppPoss = sidePossessions(box.opponent)
  const teamOffPpp = teamPoss > 0 ? r3(box.team.pts / teamPoss) : 0
  const teamDefPpp = oppPoss > 0 ? r3(box.opponent.pts / oppPoss) : 0

  // Minutes on court per player, summed from the stints they appeared in.
  const playerSeconds = playerSecondsFromStints(stints)

  // play_by_play rows. Native games always log video_time; clock_time is filled
  // only when the coach ran the optional game clock (stored as seconds-remaining,
  // matching the imported-game format).
  const pbpRows = aggEvents.map((e, i) => ({
    game_id: gameId,
    event_order: e.event_order,
    period: e.period,
    clock_time: events[i].clock_sec != null ? String(events[i].clock_sec) : null,
    video_time: events[i].video_time,
    player_id: e.player_id,
    jersey_number: events[i].jersey_number,
    event_type: e.event_type,
    team_side: e.team_side,
    points: e.points,
    team_score: events[i].team_score,
    opp_score: events[i].opp_score,
    shot_x: events[i].shot_x ?? null,
    shot_y: events[i].shot_y ?? null,
  }))

  const stintRows = stints.map(s => stintToRow(s, gameId, TEAM_ID))

  // player_game_stats — every player who took the floor or recorded a stat. Raw
  // counts + the full advanced line from lib/advancedStats. The box-derived family
  // (shooting %s, eFG/TS/TO%, a/to, ftf, per-foul) is Hoopsalytics-exact; the
  // on-court family (usage/rtg/reb%/def%s/pace, off/def/net_ppp, plus_minus) is our
  // method — exact for native games, close on imported ones. VPS stays null
  // (Hoopsalytics-proprietary); mpg is a season figure, left to the season rollup.
  const playerIds = new Set<string>([...box.players.keys(), ...advanced.keys()])
  const playerRows = [...playerIds].map(pid => {
    const c = box.players.get(pid)
    const a = advanced.get(pid)!
    const twopt_made = c?.twopt_made ?? 0, twopt_att = c?.twopt_att ?? 0
    const threept_made = c?.threept_made ?? 0, threept_att = c?.threept_att ?? 0
    const ft_made = c?.ft_made ?? 0, ft_att = c?.ft_att ?? 0
    return {
      game_id: gameId,
      player_id: pid,
      time_played_seconds: playerSeconds.get(pid) ?? 0,
      points: c?.pts ?? 0,
      reb: c?.reb ?? 0,
      oreb: c?.oreb ?? 0,
      dreb: c?.dreb ?? 0,
      fouls: c?.fouls ?? 0,
      off_fouls: c?.off_fouls ?? 0,
      def_fouls: c?.def_fouls ?? 0,
      ns_fouls: a.ns_fouls,
      ast: c?.ast ?? 0,
      stl: c?.stl ?? 0,
      blk: c?.blk ?? 0,
      turnovers: c?.turnovers ?? 0,
      twopt_made, twopt_att, twopt_miss: c?.twopt_miss ?? 0, twopt_fouled: a.twopt_fouled,
      threept_made, threept_att, threept_miss: c?.threept_miss ?? 0, threept_fouled: a.threept_fouled,
      ft_made, ft_att, ft_miss: c?.ft_miss ?? 0, ft_trips: a.ft_trips, and1: a.and1,
      // box-derived (exact)
      twopt_pct: a.twopt_pct,
      threept_pct: a.threept_pct,
      ft_pct: a.ft_pct,
      efg_pct: a.efg_pct,
      ts_pct: a.ts_pct,
      to_pct: a.to_pct,
      a_to_ratio: a.a_to_ratio,
      ftf: a.ftf,
      stl_per_foul: a.stl_per_foul,
      blk_per_foul: a.blk_per_foul,
      // on-court (our method)
      off_ppp: a.off_ppp ?? 0,
      def_ppp: a.def_ppp ?? 0,
      net_ppp: a.net_ppp ?? 0,
      plus_minus: a.plus_minus,
      off_rtg: a.off_rtg,
      def_rtg: a.def_rtg,
      usage_pct: a.usage_pct,
      reb_pct: a.reb_pct,
      ast_pct: a.ast_pct,
      stl_pct: a.stl_pct,
      blk_pct: a.blk_pct,
      def_2pt_pct: a.def_2pt_pct,
      def_3pt_pct: a.def_3pt_pct,
      def_to_pct: a.def_to_pct,
      pace: a.pace,
      off_pace: a.off_pace,
      ciq_rating: a.ciq_rating, // Courtside IQ value metric, replaces VPS
      vps: null, // Hoopsalytics-proprietary — not reproducible (§2)
    }
  })

  const t = box.team
  const teamFga = t.twopt_att + t.threept_att
  const teamRow = {
    game_id: gameId,
    team_id: TEAM_ID,
    pts: t.pts,
    twopt_made: t.twopt_made, twopt_att: t.twopt_att,
    threept_made: t.threept_made, threept_att: t.threept_att,
    ft_made: t.ft_made, ft_att: t.ft_att,
    efg_pct: teamFga > 0 ? r1(((t.twopt_made + 1.5 * t.threept_made) / teamFga) * 100) : null,
    ts_pct: (teamFga + 0.44 * t.ft_att) > 0 ? r1((t.pts / (2 * (teamFga + 0.44 * t.ft_att))) * 100) : null,
    oreb: t.oreb, dreb: t.dreb, reb: t.oreb + t.dreb,
    turnovers: t.turnovers, ast: t.ast, stl: t.stl, blk: t.blk,
    fouls: t.off_fouls + t.def_fouls, off_fouls: t.off_fouls, def_fouls: t.def_fouls,
    possessions: teamPoss,
    off_ppp: teamOffPpp, def_ppp: teamDefPpp, net_ppp: r3(teamOffPpp - teamDefPpp),
  }

  const o = box.opponent
  const oppRow = {
    game_id: gameId,
    team_id: TEAM_ID,
    opp_pts: o.pts,
    opp_twopt_made: o.twopt_made, opp_twopt_att: o.twopt_att,
    opp_threept_made: o.threept_made, opp_threept_att: o.threept_att,
    opp_ft_made: o.ft_made, opp_ft_att: o.ft_att,
    opp_possessions: oppPoss,
    opp_turnovers: o.turnovers,
    opp_off_fouls: o.off_fouls, opp_def_fouls: o.def_fouls,
    opp_oreb: o.oreb, opp_dreb: o.dreb,
    opp_ast: o.ast, opp_stl: o.stl, opp_blk: o.blk,
    opp_off_ppp: oppPoss > 0 ? r3(o.pts / oppPoss) : 0,
    opp_def_ppp: teamPoss > 0 ? r3(t.pts / teamPoss) : 0,
  }

  // Per-opponent-player box score, by jersey (null = the team-level "Other" bucket).
  // Empty for games with no opponent jerseys entered; the team-level oppRow above
  // still carries the aggregate either way. Minutes come from the same time base as
  // our stints; the "Other" bucket and any jersey never placed on court get null.
  // Rows are the UNION of jerseys with box stats and jerseys with tracked minutes, so
  // an opponent who played but recorded nothing still gets a row (with their minutes).
  const oppBox = aggregateOpponentByJersey(aggEvents)
  const oppSeconds = opponentSecondsByJersey(aggEvents, opponentStarters, { timeSource })
  const oppJerseyKeys = new Set<number | null>([...oppBox.keys()])
  for (const j of oppSeconds.keys()) oppJerseyKeys.add(j)
  const oppPlayerRows = [...oppJerseyKeys].map(jersey => {
    const c = oppBox.get(jersey)
    return {
      game_id: gameId,
      jersey_number: jersey,
      time_played_seconds: jersey != null ? (oppSeconds.get(jersey) ?? null) : null,
      points: c?.pts ?? 0,
      twopt_made: c?.twopt_made ?? 0, twopt_att: c?.twopt_att ?? 0,
      threept_made: c?.threept_made ?? 0, threept_att: c?.threept_att ?? 0,
      ft_made: c?.ft_made ?? 0, ft_att: c?.ft_att ?? 0,
      oreb: c?.oreb ?? 0, dreb: c?.dreb ?? 0, reb: c?.reb ?? 0,
      ast: c?.ast ?? 0, stl: c?.stl ?? 0, blk: c?.blk ?? 0,
      turnovers: c?.turnovers ?? 0, fouls: c?.fouls ?? 0,
    }
  })

  // ── Write everything (delete-then-reinsert, each verified) ────────────────
  for (const [table, rows] of [
    ['play_by_play', pbpRows],
    ['lineup_stints', stintRows],
    ['player_game_stats', playerRows],
    ['team_game_stats', [teamRow]],
    ['opponent_game_stats', [oppRow]],
    ['opponent_player_game_stats', oppPlayerRows],
  ] as const) {
    const err = await replaceRows(table, gameId, rows as Record<string, unknown>[])
    if (err) return { success: false, error: err }
  }

  // Finally the game header — score + result. Confirm the row updated (games has a
  // real UPDATE policy; this is the same affected-row check updateGame uses).
  const result = finalTeamScore > finalOppScore ? 'W' : finalTeamScore < finalOppScore ? 'L' : 'T'
  const { data: gData, error: gErr } = await supabase
    .from('games')
    .update({ team_score: finalTeamScore, opponent_score: finalOppScore, result })
    .eq('id', gameId)
    .select('id')
  if (gErr) return { success: false, error: `update games: ${gErr.message}` }
  if (!gData || gData.length === 0) return { success: false, error: 'update games affected 0 rows — check RLS UPDATE policy.' }

  return {
    success: true,
    written: { play_by_play: pbpRows.length, lineup_stints: stintRows.length, player_game_stats: playerRows.length },
    tallied: { team: talliedTeam, opp: talliedOpp },
  }
}

// ── Video-timing retrofit alignment ─────────────────────────────────────────
// Backfills play_by_play.video_time for an already box-scored/imported game, from
// coach-confirmed (video_time, clock_time) anchor pairs per period. See
// lib/videoAlign.ts for the interpolation itself; this is just the read-mutate-
// write around it, reusing the same delete-then-reinsert + verify pattern as
// finalizeNativeGame (play_by_play has no anon UPDATE policy — only INSERT/DELETE).
//
// Only periods present in `anchorsByPeriod` are touched — a period not included
// (e.g. aligning one quarter at a time) keeps whatever video_time it already had,
// so re-running this for one quarter can't silently wipe another's alignment.
export interface AlignResult {
  success: boolean
  error?: string
  updated?: number // rows whose video_time changed this call
}

export async function alignGameVideoTiming(
  gameId: string,
  anchorsByPeriod: Record<number, { videoTime: number; clockTime: number }[]>,
): Promise<AlignResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from('play_by_play')
    .select('event_order, period, clock_time, video_time, player_id, jersey_number, event_type, team_side, points, team_score, opp_score, shot_x, shot_y')
    .eq('game_id', gameId)
    .order('event_order', { ascending: true })
  if (fetchErr) return { success: false, error: `fetch play_by_play: ${fetchErr.message}` }
  if (!existing || existing.length === 0) return { success: false, error: 'No play-by-play found for this game.' }

  let updated = 0
  const rows = existing.map(row => {
    const anchors = anchorsByPeriod[row.period]
    if (!anchors || anchors.length < 2 || row.clock_time == null) return { ...row, game_id: gameId }
    const vt = videoTimeFromClock(Number(row.clock_time), anchors)
    if (vt == null) return { ...row, game_id: gameId }
    updated++
    return { ...row, game_id: gameId, video_time: r1(vt) }
  })

  const err = await replaceRows('play_by_play', gameId, rows as Record<string, unknown>[])
  if (err) return { success: false, error: err }
  return { success: true, updated }
}

// Shared play-by-play aggregation — the single source of truth for turning an
// ordered event log into lineup stints and box-score totals.
//
// Extracted from scripts/import_pbp.mjs so the Hoopsalytics importer and the
// native "finalize game" server action run the identical stint-reconstruction
// and possession math instead of two copies that can quietly drift apart (the
// failure mode behind the Trends zero-attempt and dashboard Type-filter bugs).
//
// The possession estimate itself is imported from driverTree — not re-declared —
// for the same reason. Node can load this .ts module (and its driverTree.ts
// import) directly via native type-stripping, so the .mjs importer uses it too;
// the explicit `.ts` extension is required by node's ESM resolver.
import { possessions } from './driverTree.ts'

export type EventType =
  | 'made_2pt' | 'missed_2pt' | 'made_3pt' | 'missed_3pt'
  | 'made_ft' | 'missed_ft'
  | 'oreb' | 'dreb' | 'assist' | 'steal' | 'block' | 'turnover'
  | 'def_foul' | 'off_foul' | 'foul'
  | 'sub_in' | 'sub_out'

export type TeamSide = 'team' | 'opponent'

// The minimal event shape the aggregator needs. Both callers already produce a
// superset of this (the importer builds it while parsing; the native entry
// screen writes it per tap), so no adapter is required beyond passing the array.
export interface AggEvent {
  event_order: number
  period: number
  event_type: EventType
  team_side: TeamSide
  points: number
  player_id: string | null
  // Game-clock position in SECONDS remaining in the period. Stored on
  // play_by_play.clock_time as a numeric string ("583"). Used for stint durations
  // when timeSource is 'clock' (imported games).
  clock_sec?: number | null
  // YouTube playback position in seconds at the moment of the tap. Used for stint
  // durations when timeSource is 'video' (native games). Null when no video.
  video_time?: number | null
}

// One contiguous 5-player on-court window with its possession accounting.
export interface Stint {
  period: number
  start_sec: number
  end_sec: number
  seconds: number
  player_ids: string[] // sorted ascending for stable comparison
  pf: number // points for (our team) during the window
  pa: number // points against during the window
  off_poss: number
  def_poss: number
  off_ppp: number
  def_ppp: number
  net_ppp: number
}

// Raw counting totals for one side (our team or the opponent bucket).
export interface SideTotals {
  pts: number
  twopt_made: number; twopt_att: number
  threept_made: number; threept_att: number
  ft_made: number; ft_att: number
  oreb: number; dreb: number
  ast: number; stl: number; blk: number
  turnovers: number
  off_fouls: number; def_fouls: number
}

// Per-player counting totals (superset of SideTotals with rebound/foul rollups
// the box score displays directly).
export interface PlayerCounts extends SideTotals {
  reb: number
  twopt_miss: number; threept_miss: number; ft_miss: number
  fouls: number
}

// Per-player on-court rate stats, rolled up across every stint the player
// appeared in — the "team's rate while this player was on the floor" figures
// that a flat per-player tally cannot produce.
export interface PlayerOnCourt {
  off_poss: number
  def_poss: number
  pf: number
  pa: number
  off_ppp: number
  def_ppp: number
  net_ppp: number
  plus_minus: number
}

const PERIOD_START_SEC = 600 // 10-minute quarters, clock counts down from 10:00

const clkToSec = (c: string | number | null | undefined): number | null => {
  if (c == null) return null
  const s = String(c)
  // Numeric-string form ("583") as stored on play_by_play.clock_time.
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  // "M:SS" form, in case a caller passes a display clock.
  const m = s.match(/(\d+):(\d+(?:\.\d+)?)/)
  return m ? parseInt(m[1]) * 60 + parseFloat(m[2]) : null
}

export const secToClk = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

// Possession count, rounded to 2dp exactly as the importer stores it.
const poss2 = (fga: number, fta: number, oreb: number, tov: number): number =>
  +possessions(fga, fta, oreb, tov).toFixed(2)

const round3 = (n: number): number => +n.toFixed(3)

// Mutable per-window accumulator.
interface Window {
  period: number
  start: number
  events: number // on-court events recorded into this window (any type)
  fga: number; fta: number; oreb: number; to: number; pf: number
  ofga: number; ofta: number; ooreb: number; oto: number; pa: number
}

function newWindow(period: number, start: number): Window {
  return { period, start, events: 0, fga: 0, fta: 0, oreb: 0, to: 0, pf: 0,
    ofga: 0, ofta: 0, ooreb: 0, oto: 0, pa: 0 }
}

// How the aggregator reads elapsed time. Imported games use the Hoopsalytics
// game clock (counts DOWN from 10:00, per period). Native video-first games have
// no game clock — they carry the YouTube playback position (counts UP), so stint
// durations come from video_time deltas instead. Possession accounting (pf/pa/
// off_poss/def_poss/ppp) is identical either way; only how `seconds` is derived
// and which empty windows get dropped differ.
export type TimeSource = 'clock' | 'video'

// Fold one scoring/rebound/turnover event into the current window's possession
// tallies. Mirrors the importer's inline accumulation exactly; only the events
// that affect a possession count (shots, FTs, OReb, TO) are recorded.
function recordPoss(w: Window, side: TeamSide, et: EventType, points: number) {
  if (side === 'opponent') {
    if (et === 'made_2pt' || et === 'made_3pt') { w.pa += points; w.ofga++ }
    else if (et === 'missed_2pt' || et === 'missed_3pt') w.ofga++
    else if (et === 'made_ft') { w.pa += 1; w.ofta++ }
    else if (et === 'missed_ft') w.ofta++
    else if (et === 'oreb') w.ooreb++
    else if (et === 'turnover') w.oto++
  } else {
    if (et === 'made_2pt' || et === 'made_3pt') { w.pf += points; w.fga++ }
    else if (et === 'missed_2pt' || et === 'missed_3pt') w.fga++
    else if (et === 'made_ft') { w.pf += 1; w.fta++ }
    else if (et === 'missed_ft') w.fta++
    else if (et === 'oreb') w.oreb++
    else if (et === 'turnover') w.to++
  }
}

function finishWindow(
  w: Window, endSec: number, lineup: Set<string>, source: TimeSource,
): Stint | null {
  if (lineup.size !== 5) return null
  // Clock counts down (start > end); video counts up (end > start). Either way a
  // stint's length is the absolute gap between when the five took the floor and
  // when the lineup next changed.
  const seconds = source === 'video'
    ? Math.round(Math.max(0, endSec - w.start))
    : Math.max(0, w.start - endSec)
  // Drop empty degenerate windows (the transient roster-of-4/6 or zero-gap windows
  // created between the two legs of a substitution). Clock mode drops on seconds
  // alone, exactly as the importer did. Video mode keeps any window that actually
  // held events even when its video-time delta rounds to zero, so a native game's
  // possession accounting is never lost just because the clock wasn't logged.
  if (source === 'video') {
    if (seconds <= 0 && w.events === 0) return null
  } else if (seconds <= 0) {
    return null
  }
  const op = poss2(w.fga, w.fta, w.oreb, w.to)
  const dp = poss2(w.ofga, w.ofta, w.ooreb, w.oto)
  const off_ppp = op > 0 ? round3(w.pf / op) : 0
  const def_ppp = dp > 0 ? round3(w.pa / dp) : 0
  return {
    period: w.period,
    start_sec: w.start,
    end_sec: endSec,
    seconds,
    player_ids: [...lineup].sort(),
    pf: w.pf, pa: w.pa,
    off_poss: op, def_poss: dp,
    off_ppp, def_ppp,
    net_ppp: round3(off_ppp - def_ppp),
  }
}

/**
 * Reconstruct lineup stints from an ordered event log.
 *
 * The event stream drives the on-court five: it is seeded with `startingLineup`
 * and updated by each `sub_in` / `sub_out` event. A window closes and a new one
 * opens on every substitution (at that event's time) and on every period change.
 *
 * Processing subs one event at a time — rather than a whole substitution line at
 * once, as the importer does — yields identical stints: the transient windows
 * where the roster is momentarily 4 or 6 players are discarded by finishWindow.
 *
 * `opts.timeSource` selects the clock: 'clock' (default) reproduces the importer
 * exactly (10:00→0:00 countdown per period); 'video' uses each event's video_time
 * (playback seconds, counting up) for native video-first games.
 */
export function reconstructStints(
  events: AggEvent[],
  startingLineup: string[],
  opts: { timeSource?: TimeSource } = {},
): Stint[] {
  const source: TimeSource = opts.timeSource ?? 'clock'
  const isVideo = source === 'video'
  const getT = (e: AggEvent): number | null =>
    isVideo ? (e.video_time ?? null) : clkToSec(e.clock_sec ?? null)

  const stints: Stint[] = []
  const lineup = new Set(startingLineup)
  const ordered = [...events].sort((a, b) => a.event_order - b.event_order)

  let curPeriod = ordered.length ? ordered[0].period : 1
  // Clock mode opens each period at 10:00; video mode opens at the tip (0s) and
  // lets the first event's video_time carry it forward.
  const periodOpen = isVideo ? 0 : PERIOD_START_SEC
  let curTime = periodOpen
  let win: Window | null = newWindow(curPeriod, periodOpen)

  const closeInto = (endT: number) => {
    if (win) {
      const s = finishWindow(win, endT, lineup, source)
      if (s) stints.push(s)
    }
  }

  for (const e of ordered) {
    // Period rollover: close the current window (clock mode at 0:00; video mode at
    // the last logged playback position) and open a fresh one for the new period.
    if (e.period !== curPeriod) {
      closeInto(isVideo ? curTime : 0)
      curPeriod = e.period
      const openT = isVideo ? (getT(e) ?? curTime) : PERIOD_START_SEC
      curTime = openT
      win = newWindow(curPeriod, openT)
    }

    const t = getT(e)
    if (t != null) curTime = t

    if (e.event_type === 'sub_in' || e.event_type === 'sub_out') {
      closeInto(curTime)
      if (e.event_type === 'sub_in') {
        if (e.player_id) lineup.add(e.player_id)
      } else if (e.player_id) {
        lineup.delete(e.player_id)
      }
      win = newWindow(curPeriod, curTime)
      continue
    }

    if (win && lineup.size === 5) {
      win.events++
      recordPoss(win, e.team_side, e.event_type, e.points)
    }
  }

  // Close the final open window (clock mode at 0:00; video mode at the last time).
  closeInto(isVideo ? curTime : 0)
  return stints
}

// Shape a Stint into a lineup_stints DB row (clock columns as "M:SS").
export function stintToRow(s: Stint, gameId: string, teamId: string) {
  return {
    game_id: gameId,
    team_id: teamId,
    period: s.period,
    start_clock: secToClk(s.start_sec),
    end_clock: secToClk(s.end_sec),
    seconds: s.seconds,
    player_ids: s.player_ids,
    pf: s.pf,
    pa: s.pa,
    off_poss: s.off_poss,
    def_poss: s.def_poss,
    off_ppp: s.off_ppp,
    def_ppp: s.def_ppp,
    net_ppp: s.net_ppp,
  }
}

function emptyPlayerCounts(): PlayerCounts {
  return {
    pts: 0, twopt_made: 0, twopt_att: 0, threept_made: 0, threept_att: 0,
    ft_made: 0, ft_att: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0,
    turnovers: 0, off_fouls: 0, def_fouls: 0,
    reb: 0, twopt_miss: 0, threept_miss: 0, ft_miss: 0, fouls: 0,
  }
}

function foldPlayerEvent(p: PlayerCounts, et: EventType, points: number) {
  switch (et) {
    case 'made_2pt': p.twopt_made++; p.twopt_att++; p.pts += points; break
    case 'missed_2pt': p.twopt_att++; p.twopt_miss++; break
    case 'made_3pt': p.threept_made++; p.threept_att++; p.pts += points; break
    case 'missed_3pt': p.threept_att++; p.threept_miss++; break
    case 'made_ft': p.ft_made++; p.ft_att++; p.pts += points; break
    case 'missed_ft': p.ft_att++; p.ft_miss++; break
    case 'oreb': p.oreb++; p.reb++; break
    case 'dreb': p.dreb++; p.reb++; break
    case 'assist': p.ast++; break
    case 'steal': p.stl++; break
    case 'block': p.blk++; break
    case 'turnover': p.turnovers++; break
    case 'def_foul': p.def_fouls++; p.fouls++; break
    case 'off_foul': p.off_fouls++; p.fouls++; break
    case 'foul': p.fouls++; break
    default: break // sub_in / sub_out contribute nothing to the box score
  }
}

function totalsFromPlayer(t: SideTotals, et: EventType, points: number) {
  // Reuse the player fold on a throwaway counts object so team/side totals and
  // per-player counts can never diverge in their event→stat mapping.
  const tmp = emptyPlayerCounts()
  foldPlayerEvent(tmp, et, points)
  t.pts += tmp.pts
  t.twopt_made += tmp.twopt_made; t.twopt_att += tmp.twopt_att
  t.threept_made += tmp.threept_made; t.threept_att += tmp.threept_att
  t.ft_made += tmp.ft_made; t.ft_att += tmp.ft_att
  t.oreb += tmp.oreb; t.dreb += tmp.dreb
  t.ast += tmp.ast; t.stl += tmp.stl; t.blk += tmp.blk
  t.turnovers += tmp.turnovers
  t.off_fouls += tmp.off_fouls; t.def_fouls += tmp.def_fouls
}

function emptySide(): SideTotals {
  return {
    pts: 0, twopt_made: 0, twopt_att: 0, threept_made: 0, threept_att: 0,
    ft_made: 0, ft_att: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0,
    turnovers: 0, off_fouls: 0, def_fouls: 0,
  }
}

export interface BoxAggregate {
  team: SideTotals
  opponent: SideTotals
  players: Map<string, PlayerCounts>
}

// Sum an event log into team-side, opponent-side, and per-player box totals.
export function aggregateBox(events: AggEvent[]): BoxAggregate {
  const team = emptySide()
  const opponent = emptySide()
  const players = new Map<string, PlayerCounts>()
  for (const e of events) {
    const side = e.team_side === 'opponent' ? opponent : team
    totalsFromPlayer(side, e.event_type, e.points)
    if (e.team_side === 'team' && e.player_id) {
      let pc = players.get(e.player_id)
      if (!pc) { pc = emptyPlayerCounts(); players.set(e.player_id, pc) }
      foldPlayerEvent(pc, e.event_type, e.points)
    }
  }
  return { team, opponent, players }
}

// Canonical possession count for a side's totals (FGA = 2PA + 3PA).
export function sidePossessions(t: SideTotals): number {
  return poss2(t.twopt_att + t.threept_att, t.ft_att, t.oreb, t.turnovers)
}

/**
 * Roll each player's on-court rate stats up across every stint they appeared in.
 *
 * This is the one genuinely new figure the importer never computed: off_ppp /
 * def_ppp / plus_minus for an individual across a whole game, derived by summing
 * the points and possessions of the units they were part of. Same definition as
 * a lineup stint, just aggregated over all stints containing the player.
 */
export function rollupPlayerOnCourt(stints: Stint[]): Map<string, PlayerOnCourt> {
  const acc = new Map<string, { off_poss: number; def_poss: number; pf: number; pa: number }>()
  for (const s of stints) {
    for (const pid of s.player_ids) {
      let a = acc.get(pid)
      if (!a) { a = { off_poss: 0, def_poss: 0, pf: 0, pa: 0 }; acc.set(pid, a) }
      a.off_poss += s.off_poss
      a.def_poss += s.def_poss
      a.pf += s.pf
      a.pa += s.pa
    }
  }
  const out = new Map<string, PlayerOnCourt>()
  for (const [pid, a] of acc) {
    const off_ppp = a.off_poss > 0 ? round3(a.pf / a.off_poss) : 0
    const def_ppp = a.def_poss > 0 ? round3(a.pa / a.def_poss) : 0
    out.set(pid, {
      off_poss: +a.off_poss.toFixed(2),
      def_poss: +a.def_poss.toFixed(2),
      pf: a.pf,
      pa: a.pa,
      off_ppp,
      def_ppp,
      net_ppp: round3(off_ppp - def_ppp),
      plus_minus: a.pf - a.pa,
    })
  }
  return out
}

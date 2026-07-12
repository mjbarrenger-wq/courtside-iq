// Phase-1 advanced (Hoopsalytics-parity) per-player stats.
//
// Turns the ordered event log + the box aggregate + the reconstructed stints into
// the full advanced stat line that Hoopsalytics exports, so a natively-scored game
// carries the same columns as an imported one. Sits on top of pbpAggregate (the
// core box + stint layer) rather than duplicating it.
//
// Parity, measured against imported games 29-32 (which carry Hoopsalytics' own
// values — see scripts/validate_advanced.mjs):
//
//   • BOX-DERIVED family — EXACT to the decimal. These depend only on a player's
//     own box line, so there is no lineup ambiguity:
//       twopt_pct, threept_pct, ft_pct, efg_pct, ts_pct, to_pct, a_to_ratio, ftf,
//       stl_per_foul, blk_per_foul
//     Two constants matter and are NOT the textbook ones:
//       – TO% and usage use round(FTA/2) as the FT-possession term, NOT 0.44·FTA.
//       – TS% keeps the conventional 0.44·FTA (it is a shooting-efficiency rate).
//
//   • PBP-INFERRED family — exact for our own logs; no Hoopsalytics per-game value
//     to validate against (those columns are null on the imported games):
//       ft_trips, and1, twopt_fouled, threept_fouled, ns_fouls
//
//   • ON-COURT family — OUR METHOD. Exact for native games (every tap carries a
//     video timestamp) but only ~±3% against the imported games, because the
//     Hoopsalytics export's clock stamps are coarser than our per-event timing, so
//     per-player floor time (and every rate built on it) redistributes slightly:
//       plus_minus (scoreboard differential), off_rtg, def_rtg, off_ppp, def_ppp,
//       net_ppp, usage_pct, reb_pct, ast_pct, stl_pct, blk_pct,
//       def_2pt_pct, def_3pt_pct, def_to_pct, pace, off_pace
//
// mpg is a SEASON figure (minutes ÷ games) and is left to the season rollup — it is
// null on a single game row, matching the imported games.
import { possessions } from './driverTree.ts'
import type { AggEvent, BoxAggregate, Stint, EventType } from './pbpAggregate.ts'

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const pct1 = (made: number, att: number): number | null => (att > 0 ? r1((made / att) * 100) : null)

// FT possessions used for the TO% / usage "plays" denominator. Hoopsalytics counts
// a free-throw trip (a pair, or a lone bonus/technical shot) as one possession, which
// reproduces its stored TO% exactly — round(FTA/2), NOT the 0.44·FTA heuristic.
export const ftPlays = (fta: number): number => Math.round(fta / 2)

const PERIOD_START_SEC = 600

// ── CIQ Rating ──────────────────────────────────────────────────────────────
// Courtside IQ's own player value metric, replacing Hoopsalytics VPS. Points of
// value per 100 possessions, blending a stable individual box estimate with the
// team's shrunk on-court net impact. Weights are accepted possession-value
// estimates (a steal ≈ a point saved+gained, a block ≈ 0.7, an offensive rebound
// ≈ half a possession, etc.); the scoring baseline is this SEASON's own average
// points-per-play (see seasonCiqBaseline below) so scoring above it is credited
// and below it penalised — it self-calibrates to the roster's actual scoring
// tempo instead of a guessed universal constant. K sets how fast on-court earns
// weight over box as possessions accumulate — at ~50 on-court possessions a game
// a single game is ~25% on-court / 75% box, and a full season tilts on-court.
// Kept as one exported block so finalize, the season rollup, and the backfill
// all compute an identical number.
export const CIQ = {
  baseline: 0.63, // fallback only — used when a season has no games yet to derive its own rate from
  ast: 1.0, oreb: 0.5, dreb: 0.3, stl: 1.0, blk: 0.7, defFoul: 0.3,
  // A turnover already costs the baseline implicitly, since it is a "play" that
  // scored nothing. This is an EXTRA penalty on top, for the live-ball/transition
  // danger a giveaway carries beyond an ordinary empty possession — total cost
  // ≈ baseline + 0.4 points per turnover.
  turnover: 0.4,
  K: 150, // shrinkage: on-court weight = possPlayed / (possPlayed + K)
  estTeamPossPerGame: 48, // box-only fallback: scale minutes → on-court possessions
} as const

// This season's own scoring baseline: total points ÷ total "plays" (FGA + FT
// plays + turnovers) across every player-game passed in. Replaces a guessed
// universal constant with the roster's actual rate, so CIQ's break-even line
// tracks reality as the season's scoring tempo settles. Falls back to
// CIQ.baseline when there's no data yet (e.g. the first game of a new season).
export function seasonCiqBaseline(
  rows: { points: number; twopt_att: number; threept_att: number; ft_att: number; turnovers: number }[],
): number {
  let pts = 0, plays = 0
  for (const r of rows) {
    pts += r.points
    plays += r.twopt_att + r.threept_att + ftPlays(r.ft_att) + r.turnovers
  }
  return plays > 0 ? pts / plays : CIQ.baseline
}

// The box counting fields CIQ reads. A superset lives on PlayerCounts and on a
// player_game_stats row, so both the live event log and a stored box row qualify.
export interface CiqCounts {
  points: number
  twopt_att: number; threept_att: number; ft_att: number
  turnovers: number; ast: number; oreb: number; dreb: number
  stl: number; blk: number; def_fouls: number
}

// On-court context for one player-game (team points/possessions for and against
// while the player was one of the five). Null → box-only game (no pbp).
export interface CiqOnCourt { offPoss: number; defPoss: number; pf: number; pa: number }

/**
 * CIQ Rating for one player-game. Returns points/100 (1dp), or null when the
 * player logged no possessions to rate. `baseline` should be this season's own
 * scoring rate (seasonCiqBaseline); defaults to CIQ.baseline when omitted.
 */
export function ciqRating(
  c: CiqCounts, onCourt: CiqOnCourt | null, timePlayedSeconds: number,
  baseline: number = CIQ.baseline,
): number | null {
  const fga = c.twopt_att + c.threept_att
  const plays = fga + ftPlays(c.ft_att) + c.turnovers
  const boxRaw =
    (c.points - plays * baseline) +
    CIQ.ast * c.ast + CIQ.oreb * c.oreb + CIQ.dreb * c.dreb +
    CIQ.stl * c.stl + CIQ.blk * c.blk -
    CIQ.defFoul * c.def_fouls - CIQ.turnover * c.turnovers

  let possPlayed: number
  let net100 = 0
  let w = 0
  if (onCourt && onCourt.offPoss + onCourt.defPoss > 0) {
    possPlayed = (onCourt.offPoss + onCourt.defPoss) / 2
    const offPpp = onCourt.offPoss > 0 ? onCourt.pf / onCourt.offPoss : 0
    const defPpp = onCourt.defPoss > 0 ? onCourt.pa / onCourt.defPoss : 0
    net100 = (offPpp - defPpp) * 100
    w = possPlayed / (possPlayed + CIQ.K)
  } else {
    // Box-only game (no pbp): estimate on-court possessions from floor time so the
    // per-100 rate is on a comparable scale. Pure box, no on-court term.
    possPlayed = timePlayedSeconds > 0
      ? Math.max(8, (timePlayedSeconds / 2400) * CIQ.estTeamPossPerGame)
      : 0
  }
  if (possPlayed <= 0) return null
  const box100 = (boxRaw / possPlayed) * 100
  return r1(w * net100 + (1 - w) * box100)
}

export interface AdvancedPlayer {
  // box-derived (exact parity)
  twopt_pct: number | null
  threept_pct: number | null
  ft_pct: number | null
  efg_pct: number | null
  ts_pct: number | null
  to_pct: number | null
  a_to_ratio: number | null
  ftf: number | null
  stl_per_foul: number | null
  blk_per_foul: number | null
  // pbp-inferred (exact for our logs; no per-game Hoopsalytics target)
  ft_trips: number
  and1: number
  twopt_fouled: number
  threept_fouled: number
  ns_fouls: number
  // on-court (our method)
  plus_minus: number
  off_ppp: number | null
  def_ppp: number | null
  net_ppp: number | null
  off_rtg: number | null
  def_rtg: number | null
  usage_pct: number | null
  reb_pct: number | null
  ast_pct: number | null
  stl_pct: number | null
  blk_pct: number | null
  def_2pt_pct: number | null
  def_3pt_pct: number | null
  def_to_pct: number | null
  pace: number | null
  off_pace: number | null
  // Courtside IQ value metric (points/100), replaces VPS.
  ciq_rating: number | null
}

// One player's on-court accumulators, gathered while the player is one of the five.
interface OnCourt {
  pm: number // scoreboard +/- (attributed on every margin change, any lineup size)
  teamPts: number; oppPts: number
  teamFga: number; teamFta: number; teamOreb: number; teamTo: number; teamFgm: number
  oppFga: number; oppFta: number; oppOreb: number; oppTo: number
  opp2m: number; opp2a: number; opp3m: number; opp3a: number
  teamReb: number; oppReb: number
  seconds: number
}

const newOnCourt = (): OnCourt => ({
  pm: 0, teamPts: 0, oppPts: 0,
  teamFga: 0, teamFta: 0, teamOreb: 0, teamTo: 0, teamFgm: 0,
  oppFga: 0, oppFta: 0, oppOreb: 0, oppTo: 0,
  opp2m: 0, opp2a: 0, opp3m: 0, opp3a: 0,
  teamReb: 0, oppReb: 0, seconds: 0,
})

const isFt = (et: EventType) => et === 'made_ft' || et === 'missed_ft'
const isMadeFg = (et: EventType) => et === 'made_2pt' || et === 'made_3pt'
const isFgAtt = (et: EventType) =>
  et === 'made_2pt' || et === 'missed_2pt' || et === 'made_3pt' || et === 'missed_3pt'

/**
 * Walk the ordered event log once, tracking the on-court five, and fold every
 * event into the accumulators of whoever was on the floor. Returns a per-player
 * OnCourt map. `timeSource` picks the clock the same way reconstructStints does
 * (clock counts down from 10:00; video counts up from the tip).
 */
function walkOnCourt(
  events: AggEvent[], starters: string[], timeSource: 'clock' | 'video',
): Map<string, OnCourt> {
  const acc = new Map<string, OnCourt>()
  const get = (pid: string) => {
    let a = acc.get(pid); if (!a) { a = newOnCourt(); acc.set(pid, a) }; return a
  }
  for (const pid of starters) get(pid)

  const ordered = [...events].sort((a, b) => a.event_order - b.event_order)
  const lineup = new Set(starters)
  const isVideo = timeSource === 'video'

  let curPeriod = ordered.length ? ordered[0].period : 1
  let curTime = isVideo ? (ordered.length ? (ordered[0].video_time ?? 0) : 0) : PERIOD_START_SEC

  const addSeconds = (nextTime: number) => {
    const dt = isVideo ? nextTime - curTime : curTime - nextTime
    if (dt > 0) for (const pid of lineup) get(pid).seconds += dt
    curTime = nextTime
  }

  for (const e of ordered) {
    // Period rollover: close out the old period (clock → 0:00; video → last time),
    // then open the new one (clock → 10:00; video → this event's time).
    if (e.period !== curPeriod) {
      if (!isVideo) addSeconds(0)
      curPeriod = e.period
      curTime = isVideo ? (e.video_time ?? curTime) : PERIOD_START_SEC
    }
    const t = isVideo ? e.video_time : e.clock_sec
    if (t != null) addSeconds(t)

    // Scoreboard +/- : on each scoring event, attribute the signed point swing to
    // everyone on the floor — including a transient 4/6-man window mid-substitution
    // (matches the standard definition and Hoopsalytics' own). Derived from `points`
    // so it needs no running-score columns on the event.
    if (e.points) {
      const dMargin = e.team_side === 'opponent' ? -e.points : e.points
      for (const pid of lineup) get(pid).pm += dMargin
    }

    // Possession / shooting / rebound attribution only over clean five-man windows.
    if (lineup.size === 5) {
      const et = e.event_type
      for (const pid of lineup) {
        const a = get(pid)
        if (e.team_side === 'team') {
          if (isMadeFg(et)) { a.teamPts += e.points; a.teamFga++; a.teamFgm++ }
          else if (et === 'missed_2pt' || et === 'missed_3pt') a.teamFga++
          else if (et === 'made_ft') { a.teamPts += 1; a.teamFta++ }
          else if (et === 'missed_ft') a.teamFta++
          else if (et === 'oreb') { a.teamOreb++; a.teamReb++ }
          else if (et === 'dreb') a.teamReb++
          else if (et === 'turnover') a.teamTo++
        } else if (e.team_side === 'opponent') {
          if (et === 'made_2pt') { a.oppPts += e.points; a.oppFga++; a.opp2m++; a.opp2a++ }
          else if (et === 'made_3pt') { a.oppPts += e.points; a.oppFga++; a.opp3m++; a.opp3a++ }
          else if (et === 'missed_2pt') { a.oppFga++; a.opp2a++ }
          else if (et === 'missed_3pt') { a.oppFga++; a.opp3a++ }
          else if (et === 'made_ft') { a.oppPts += 1; a.oppFta++ }
          else if (et === 'missed_ft') a.oppFta++
          else if (et === 'oreb') { a.oppOreb++; a.oppReb++ }
          else if (et === 'dreb') a.oppReb++
          else if (et === 'turnover') a.oppTo++
        }
      }
    }

    if (e.event_type === 'sub_in') { if (e.player_id) lineup.add(e.player_id) }
    else if (e.event_type === 'sub_out') { if (e.player_id) lineup.delete(e.player_id) }
  }
  // Close the final open window.
  if (!isVideo) addSeconds(0)
  return acc
}

// Per-player free-throw-derived inferences (ft_trips / and1 / *_fouled), read off the
// pbp. A "trip" is an uninterrupted run of a player's FT attempts; an and-1 is a made
// field goal immediately followed by that same player's 1-shot FT trip; a shot is
// "fouled" when the attempt is immediately followed by that player's FT trip.
interface FtInfer { ft_trips: number; and1: number; twopt_fouled: number; threept_fouled: number }

function inferFtEvents(events: AggEvent[]): Map<string, FtInfer> {
  const out = new Map<string, FtInfer>()
  const get = (pid: string) => {
    let f = out.get(pid); if (!f) { f = { ft_trips: 0, and1: 0, twopt_fouled: 0, threept_fouled: 0 }; out.set(pid, f) }; return f
  }
  const ordered = [...events].sort((a, b) => a.event_order - b.event_order)

  // Group each player's consecutive FT attempts into trips.
  const lastFtOrd = new Map<string, number>()      // player → event_order of their previous FT
  const tripStartIdx = new Map<string, number>()   // player → index where the current trip began
  const trips: { pid: string; startOrd: number; count: number }[] = []
  const tripByStart = new Map<string, { pid: string; startOrd: number; count: number }>()

  for (const e of ordered) {
    if (!isFt(e.event_type) || e.team_side !== 'team' || !e.player_id) continue
    const pid = e.player_id
    const prev = lastFtOrd.get(pid)
    if (prev == null || e.event_order !== prev + 1) {
      const trip = { pid, startOrd: e.event_order, count: 0 }
      trips.push(trip)
      tripByStart.set(`${pid}:${e.event_order}`, trip)
      tripStartIdx.set(pid, e.event_order)
    }
    const startOrd = tripStartIdx.get(pid)!
    tripByStart.get(`${pid}:${startOrd}`)!.count++
    lastFtOrd.set(pid, e.event_order)
  }
  for (const trip of trips) get(trip.pid).ft_trips++

  // and-1 and shot-fouled: look at each FG attempt and the trip (if any) that starts
  // immediately after it for the same player.
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i]
    if (!isFgAtt(e.event_type) || e.team_side !== 'team' || !e.player_id) continue
    const trip = tripByStart.get(`${e.player_id}:${e.event_order + 1}`)
    if (!trip) continue
    const f = get(e.player_id)
    if (e.event_type === 'made_2pt' || e.event_type === 'missed_2pt') f.twopt_fouled++
    else f.threept_fouled++
    if (isMadeFg(e.event_type) && trip.count === 1) f.and1++
  }
  return out
}

// Non-shooting fouls: our defensive fouls that are NOT immediately followed by an
// opponent free-throw trip. ("A foul not followed by FTs = non-shooting.")
function inferNsFouls(events: AggEvent[]): Map<string, number> {
  const out = new Map<string, number>()
  const ordered = [...events].sort((a, b) => a.event_order - b.event_order)
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i]
    if (e.event_type !== 'def_foul' || e.team_side !== 'team' || !e.player_id) continue
    const next = ordered[i + 1]
    const shooting = next && next.team_side === 'opponent' && isFt(next.event_type)
    if (!shooting) out.set(e.player_id, (out.get(e.player_id) ?? 0) + 1)
  }
  return out
}

/**
 * Compute the full advanced stat line for every player who appears in the box or on
 * the floor. `box` and `stints` come from pbpAggregate; `timeSource` matches the one
 * passed to reconstructStints (native games: 'video' when no clock was run).
 * `ciqBaseline` should be this season's own scoring rate (seasonCiqBaseline);
 * defaults to CIQ.baseline when the caller has no season data to derive it from.
 */
export function computePlayerAdvanced(
  events: AggEvent[],
  starters: string[],
  box: BoxAggregate,
  opts: { timeSource?: 'clock' | 'video'; ciqBaseline?: number } = {},
): Map<string, AdvancedPlayer> {
  const timeSource = opts.timeSource ?? 'clock'
  const ciqBaseline = opts.ciqBaseline ?? CIQ.baseline
  const onCourt = walkOnCourt(events, starters, timeSource)
  const ftInfer = inferFtEvents(events)
  const nsFouls = inferNsFouls(events)

  const out = new Map<string, AdvancedPlayer>()
  const pids = new Set<string>([...box.players.keys(), ...onCourt.keys()])

  for (const pid of pids) {
    const c = box.players.get(pid)
    const a = onCourt.get(pid) ?? newOnCourt()
    const fi = ftInfer.get(pid) ?? { ft_trips: 0, and1: 0, twopt_fouled: 0, threept_fouled: 0 }

    const twopt_made = c?.twopt_made ?? 0, twopt_att = c?.twopt_att ?? 0
    const threept_made = c?.threept_made ?? 0, threept_att = c?.threept_att ?? 0
    const ft_made = c?.ft_made ?? 0, ft_att = c?.ft_att ?? 0
    const pts = c?.pts ?? 0, tov = c?.turnovers ?? 0, ast = c?.ast ?? 0
    const stl = c?.stl ?? 0, blk = c?.blk ?? 0, fouls = c?.fouls ?? 0, reb = c?.reb ?? 0
    const fga = twopt_att + threept_att

    // ── box-derived (exact) ──
    const efg_pct = fga > 0 ? r1(((twopt_made + 1.5 * threept_made) / fga) * 100) : null
    const tsDen = 2 * (fga + 0.44 * ft_att)
    const ts_pct = tsDen > 0 ? r1((pts / tsDen) * 100) : null
    const playsDen = fga + ftPlays(ft_att) + tov
    const to_pct = playsDen > 0 ? r1((tov / playsDen) * 100) : null

    // ── on-court possession accounting (our method) ──
    const offPoss = possessions(a.teamFga, a.teamFta, a.teamOreb, a.teamTo)
    const defPoss = possessions(a.oppFga, a.oppFta, a.oppOreb, a.oppTo)
    const off_ppp = offPoss > 0 ? r2(a.teamPts / offPoss) : null
    const def_ppp = defPoss > 0 ? r2(a.oppPts / defPoss) : null
    const off_rtg = offPoss > 0 ? r1((a.teamPts / offPoss) * 100) : null
    const def_rtg = defPoss > 0 ? r1((a.oppPts / defPoss) * 100) : null
    const teamPlaysOnCourt = a.teamFga + ftPlays(a.teamFta) + a.teamTo
    const usage_pct = teamPlaysOnCourt > 0 ? r1((playsDen / teamPlaysOnCourt) * 100) : null
    const rebDen = a.teamReb + a.oppReb
    const reb_pct = rebDen > 0 ? r1((reb / rebDen) * 100) : null
    const astDen = a.teamFgm - twopt_made - threept_made // teammates' made FGs on court
    const ast_pct = astDen > 0 ? r1((ast / astDen) * 100) : null
    const stl_pct = defPoss > 0 ? r1((stl / defPoss) * 100) : null
    const blk_pct = a.opp2a > 0 ? r1((blk / a.opp2a) * 100) : null
    const def_2pt_pct = a.opp2a > 0 ? r1((a.opp2m / a.opp2a) * 100) : null
    const def_3pt_pct = a.opp3a > 0 ? r1((a.opp3m / a.opp3a) * 100) : null
    const def_to_pct = defPoss > 0 ? r1((a.oppTo / defPoss) * 100) : null
    const mins = a.seconds / 60
    const off_pace = mins > 0 ? r1((offPoss / mins) * 40) : null
    const pace = mins > 0 ? r1((((offPoss + defPoss) / 2) / mins) * 40) : null

    const ciq_rating = ciqRating(
      { points: pts, twopt_att, threept_att, ft_att, turnovers: tov,
        ast, oreb: c?.oreb ?? 0, dreb: c?.dreb ?? 0, stl, blk, def_fouls: c?.def_fouls ?? 0 },
      offPoss + defPoss > 0 ? { offPoss, defPoss, pf: a.teamPts, pa: a.oppPts } : null,
      a.seconds,
      ciqBaseline,
    )

    out.set(pid, {
      twopt_pct: pct1(twopt_made, twopt_att),
      threept_pct: pct1(threept_made, threept_att),
      ft_pct: pct1(ft_made, ft_att),
      efg_pct, ts_pct, to_pct,
      a_to_ratio: tov > 0 ? r1(ast / tov) : null,
      ftf: fga > 0 ? r2(ft_att / fga) : null,
      stl_per_foul: fouls > 0 ? r2(stl / fouls) : null,
      blk_per_foul: fouls > 0 ? r2(blk / fouls) : null,
      ft_trips: fi.ft_trips,
      and1: fi.and1,
      twopt_fouled: fi.twopt_fouled,
      threept_fouled: fi.threept_fouled,
      ns_fouls: nsFouls.get(pid) ?? 0,
      plus_minus: a.pm,
      off_ppp, def_ppp,
      net_ppp: off_ppp != null && def_ppp != null ? r2(off_ppp - def_ppp) : null,
      off_rtg, def_rtg, usage_pct, reb_pct, ast_pct, stl_pct, blk_pct,
      def_2pt_pct, def_3pt_pct, def_to_pct, pace, off_pace,
      ciq_rating,
    })
  }
  return out
}

// Total on-court seconds per player (used for time_played_seconds). Kept here so the
// finalize action and validation share one definition; matches walkOnCourt's clock.
export function playerSecondsFromStints(stints: Stint[]): Map<string, number> {
  const secs = new Map<string, number>()
  for (const s of stints) for (const pid of s.player_ids) secs.set(pid, (secs.get(pid) ?? 0) + s.seconds)
  return secs
}

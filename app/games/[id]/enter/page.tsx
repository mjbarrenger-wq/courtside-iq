import Link from 'next/link'
import EntryScreen, { type EntryPlayer } from './EntryScreen'
import type { EntryState, LocalEvent } from '@/lib/entryState'
import { fetchRows } from '@/lib/supabaseRest'
import type { GameRow, OpponentRow, PlayByPlayRow, LineupStintRow } from '@/lib/dbTypes'

export const dynamic = 'force-dynamic'

// play_by_play as finalize writes it: every native row carries an order, period,
// event type and side, so those four schema-nullable columns are non-null here.
type PbpRow =
  Pick<PlayByPlayRow, 'clock_time' | 'video_time' | 'player_id' | 'jersey_number' | 'points' | 'team_score' | 'opp_score' | 'shot_x' | 'shot_y'> & {
    event_order: NonNullable<PlayByPlayRow['event_order']>
    period: NonNullable<PlayByPlayRow['period']>
    event_type: NonNullable<PlayByPlayRow['event_type']>
    team_side: NonNullable<PlayByPlayRow['team_side']>
  }
type StintRow = Pick<LineupStintRow, 'period' | 'start_clock' | 'player_ids'>

// Rebuild the in-app entry state from a game's stored play-by-play, so a finalized
// (or previously-scored) game can be reopened and edited rather than being locked.
// Starters come from the first period-1 lineup stint (they aren't logged as events);
// the dressed set is the whole roster so any player can be subbed during an edit.
function reconstructState(
  gameId: string, pbp: PbpRow[], stints: StintRow[], players: EntryPlayer[],
): EntryState | null {
  if (pbp.length === 0) return null

  const events: LocalEvent[] = pbp
    .slice()
    .sort((a, b) => a.event_order - b.event_order)
    .map(r => ({
      event_order: r.event_order,
      period: r.period,
      event_type: r.event_type,
      team_side: r.team_side,
      points: r.points ?? 0,
      player_id: r.player_id ?? null,
      jersey_number: r.jersey_number ?? null,
      // clock_time / video_time are text columns — coerce back to numbers.
      video_time: r.video_time != null && r.video_time !== '' ? Number(r.video_time) : null,
      clock_sec: r.clock_time != null && r.clock_time !== '' ? parseFloat(r.clock_time) : null,
      team_score: r.team_score ?? 0,
      opp_score: r.opp_score ?? 0,
      shot_x: r.shot_x ?? null,
      shot_y: r.shot_y ?? null,
    }))

  // Opponent jersey numbers seen in the log, so the per-opponent chips reappear.
  const opponentJerseys = [...new Set(
    events.filter(e => e.team_side === 'opponent' && e.jersey_number != null).map(e => e.jersey_number as number),
  )].sort((a, b) => a - b)

  // Best-effort recovery of the opponent starting five (localStorage is gone on a
  // fresh reopen). A jersey was on court at tip if its FIRST period-1 appearance is a
  // stat or a sub_out (you can't be subbed off unless you were on) rather than its own
  // sub_in. Mirrors the team-starters fallback; only matters for re-finalize minutes.
  const opponentStarters: number[] = []
  const oppSubbedIn = new Set<number>()
  for (const e of events) {
    if (e.period !== 1) break
    if (e.team_side !== 'opponent' || e.jersey_number == null) continue
    const j = e.jersey_number
    if (e.event_type === 'sub_in') { oppSubbedIn.add(j); continue }
    if (!oppSubbedIn.has(j) && !opponentStarters.includes(j) && opponentStarters.length < 5) {
      opponentStarters.push(j)
    }
  }

  const p1 = stints.filter(s => s.period === 1)
  const first = p1.find(s => s.start_clock === '10:00') ?? p1[0]
  let starters: string[] = Array.isArray(first?.player_ids) ? first.player_ids : []
  if (starters.length !== 5) {
    // Fallback: first five distinct team players to appear in the log.
    const seen: string[] = []
    for (const e of events) {
      if (e.team_side === 'team' && e.player_id && !seen.includes(e.player_id)) seen.push(e.player_id)
      if (seen.length === 5) break
    }
    starters = seen
  }

  return {
    gameId,
    dressed: players.map(p => p.id),
    starters,
    period: events.length ? events[events.length - 1].period : 1,
    events,
    opponentJerseys,
    opponentStarters,
    updatedAt: Date.now(),
  }
}

export default async function EnterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [games, players, pbp, stints] = await Promise.all([
    fetchRows<Pick<GameRow, 'id' | 'game_date' | 'opponent_id' | 'video_urls'>>(`games?id=eq.${id}&select=id,game_date,opponent_id,video_urls`),
    fetchRows<EntryPlayer>('players?select=id,jersey_number,first_name,last_name&order=jersey_number.asc'),
    fetchRows<PbpRow>(`play_by_play?game_id=eq.${id}&select=event_order,period,clock_time,video_time,player_id,jersey_number,event_type,team_side,points,team_score,opp_score,shot_x,shot_y&order=event_order.asc`),
    fetchRows<StintRow>(`lineup_stints?game_id=eq.${id}&select=period,start_clock,player_ids`),
  ])
  const game = games[0] ?? null

  let opponentName = 'Opponent'
  if (game?.opponent_id) {
    const opp = await fetchRows<Pick<OpponentRow, 'full_name'>>(`opponents?id=eq.${game.opponent_id}&select=full_name`)
    if (opp[0]?.full_name) opponentName = opp[0].full_name
  }

  if (!game) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Game not found. <Link href="/games/new" style={{ color: '#307b92' }}>Create one</Link>.
        </div>
      </main>
    )
  }

  const resumeState = reconstructState(id, pbp, stints, players)

  return (
    <EntryScreen
      gameId={id}
      players={players}
      opponentName={opponentName}
      videoUrls={Array.isArray(game.video_urls) ? game.video_urls : []}
      resumeState={resumeState}
    />
  )
}

import EntryScreen, { type EntryPlayer } from './EntryScreen'
import type { EntryState, LocalEvent } from '@/lib/entryState'

export const dynamic = 'force-dynamic'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function fetchJson(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: 'no-store',
  })
  return res.json()
}

// Rebuild the in-app entry state from a game's stored play-by-play, so a finalized
// (or previously-scored) game can be reopened and edited rather than being locked.
// Starters come from the first period-1 lineup stint (they aren't logged as events);
// the dressed set is the whole roster so any player can be subbed during an edit.
function reconstructState(
  gameId: string, pbp: any[], stints: any[], players: EntryPlayer[],
): EntryState | null {
  if (!Array.isArray(pbp) || pbp.length === 0) return null

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
    }))

  const p1 = (Array.isArray(stints) ? stints : []).filter(s => s.period === 1)
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
    updatedAt: Date.now(),
  }
}

export default async function EnterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [gamesRaw, playersRaw, pbpRaw, stintsRaw] = await Promise.all([
    fetchJson(`games?id=eq.${id}&select=id,game_date,opponent_id,video_urls`),
    fetchJson('players?select=id,jersey_number,first_name,last_name&order=jersey_number.asc'),
    fetchJson(`play_by_play?game_id=eq.${id}&select=event_order,period,clock_time,video_time,player_id,jersey_number,event_type,team_side,points,team_score,opp_score&order=event_order.asc`),
    fetchJson(`lineup_stints?game_id=eq.${id}&select=period,start_clock,player_ids`),
  ])
  const game = Array.isArray(gamesRaw) ? gamesRaw[0] : null
  const players: EntryPlayer[] = Array.isArray(playersRaw) ? playersRaw : []

  let opponentName = 'Opponent'
  if (game?.opponent_id) {
    const oppRaw = await fetchJson(`opponents?id=eq.${game.opponent_id}&select=full_name`)
    if (Array.isArray(oppRaw) && oppRaw[0]?.full_name) opponentName = oppRaw[0].full_name
  }

  if (!game) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Game not found. <a href="/games/new" style={{ color: '#307b92' }}>Create one</a>.
        </div>
      </main>
    )
  }

  const resumeState = reconstructState(id, pbpRaw, stintsRaw, players)

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

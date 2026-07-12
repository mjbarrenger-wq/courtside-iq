import AlignScreen, { type AlignEvent, type AlignPlayer } from './AlignScreen'

export const dynamic = 'force-dynamic'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const BG = '#f4f5f7'

async function fetchJson(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: 'no-store',
  })
  return res.json()
}

// clock_time / video_time are text columns → coerce back to numbers.
/* eslint-disable @typescript-eslint/no-explicit-any */
function toEvents(pbp: any[]): AlignEvent[] {
  if (!Array.isArray(pbp)) return []
  return pbp
    .slice()
    .sort((a: any, b: any) => a.event_order - b.event_order)
    .map(r => ({
      event_order: r.event_order,
      period: r.period,
      event_type: r.event_type,
      team_side: r.team_side,
      points: r.points ?? 0,
      player_id: r.player_id ?? null,
      jersey_number: r.jersey_number ?? null,
      clockTime: r.clock_time != null && r.clock_time !== '' ? Number(r.clock_time) : null,
      videoTime: r.video_time != null && r.video_time !== '' ? Number(r.video_time) : null,
    }))
}

export default async function AlignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [gamesRaw, playersRaw, pbpRaw] = await Promise.all([
    fetchJson(`games?id=eq.${id}&select=id,game_date,opponent_id,video_urls`),
    fetchJson('players?select=id,jersey_number,first_name,last_name&order=jersey_number.asc'),
    fetchJson(`play_by_play?game_id=eq.${id}&select=event_order,period,clock_time,video_time,player_id,jersey_number,event_type,team_side,points&order=event_order.asc`),
  ])
  const game = Array.isArray(gamesRaw) ? gamesRaw[0] : null
  const players: AlignPlayer[] = Array.isArray(playersRaw) ? playersRaw : []

  let opponentName = 'Opponent'
  if (game?.opponent_id) {
    const oppRaw = await fetchJson(`opponents?id=eq.${game.opponent_id}&select=full_name`)
    if (Array.isArray(oppRaw) && oppRaw[0]?.full_name) opponentName = oppRaw[0].full_name
  }

  const videoUrls: string[] = Array.isArray(game?.video_urls) ? game.video_urls : []
  const events = toEvents(pbpRaw)

  if (!game || videoUrls.length === 0 || events.length === 0) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: BG, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
          {!game
            ? <>Game not found.</>
            : videoUrls.length === 0
            ? <>This game has no video attached yet — attach video from the debrief page first.</>
            : <>No play-by-play found for this game — nothing to align.</>}
          <div style={{ marginTop: 8 }}>
            <a href={`/games/${id}`} style={{ color: '#307b92', fontWeight: 700 }}>← Back to the debrief</a>
          </div>
        </div>
      </main>
    )
  }

  return (
    <AlignScreen
      gameId={id}
      players={players}
      opponentName={opponentName}
      videoUrls={videoUrls}
      events={events}
    />
  )
}

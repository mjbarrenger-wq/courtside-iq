import FinalizeReview, { type FinalizePlayer } from './FinalizeReview'

export const dynamic = 'force-dynamic'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const BG     = '#f4f5f7'
const BORDER = '#e2e5eb'
const HEADER = '#ffffff'
const MUTED  = '#6b7280'

async function fetchJson(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: 'no-store',
  })
  return res.json()
}

export default async function FinalizePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [gamesRaw, playersRaw] = await Promise.all([
    fetchJson(`games?id=eq.${id}&select=id,game_date,opponent_id,team_score`),
    fetchJson('players?select=id,jersey_number,first_name,last_name&order=jersey_number.asc'),
  ])
  const game = Array.isArray(gamesRaw) ? gamesRaw[0] : null
  const players: FinalizePlayer[] = Array.isArray(playersRaw) ? playersRaw : []

  let opponentName = 'Opponent'
  if (game?.opponent_id) {
    const oppRaw = await fetchJson(`opponents?id=eq.${game.opponent_id}&select=full_name`)
    if (Array.isArray(oppRaw) && oppRaw[0]?.full_name) opponentName = oppRaw[0].full_name
  }

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif", WebkitFontSmoothing: 'antialiased', padding: '0 0 64px',
    }}>
      <div className="px-4 md:px-8 py-5" style={{ background: HEADER, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>
            <a href={`/games/${id}/enter`} style={{ color: MUTED, textDecoration: 'none' }}>Enter</a>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ color: '#307b92' }}>Finalize</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{game ? <>Finalize — vs {opponentName}</> : 'Game not found'}</div>
          {game && (
            <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
              Check the tally against the real final score, then commit. This writes the box score,
              lineup stints and play-by-play.
            </div>
          )}
        </div>
      </div>

      <div className="px-4 md:px-8 pt-6" style={{ maxWidth: 1120, margin: '0 auto' }}>
        {game ? (
          <FinalizeReview gameId={id} players={players} opponentName={opponentName}
            alreadyFinal={game.team_score != null} />
        ) : (
          <div style={{ fontSize: 13, color: MUTED }}>That game doesn&rsquo;t exist.</div>
        )}
      </div>
    </main>
  )
}

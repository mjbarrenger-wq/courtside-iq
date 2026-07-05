import NewGameForm from './NewGameForm'
import type { OpponentOption } from '../GamesSetupTable'

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

export default async function NewGamePage() {
  const [opponentsRaw, latestRaw] = await Promise.all([
    fetchJson('opponents?select=id,full_name&order=full_name.asc'),
    fetchJson('games?select=season&order=game_date.desc&limit=1'),
  ])

  const opponents: OpponentOption[] = Array.isArray(opponentsRaw) ? opponentsRaw : []
  const defaultSeason: string | null =
    Array.isArray(latestRaw) && latestRaw[0]?.season ? latestRaw[0].season : null

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 64px',
    }}>
      <div className="px-4 md:px-8 py-5" style={{ background: HEADER, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>
            <a href="/games" style={{ color: MUTED, textDecoration: 'none' }}>Game Config</a>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ color: '#307b92' }}>New Game</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>New Game</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            Create a game to score from video. Add the YouTube link(s), pick tonight&rsquo;s roster next,
            then tap events as you watch.
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-6" style={{ maxWidth: 920, margin: '0 auto' }}>
        <NewGameForm opponents={opponents} defaultSeason={defaultSeason} />
      </div>
    </main>
  )
}

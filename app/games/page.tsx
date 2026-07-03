import GamesSetupTable, { type GameRow, type OpponentOption } from './GamesSetupTable'
import type { GameTypeKey } from '../dashboard/filterConfig'

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

export default async function GamesSetupPage() {
  const [gamesRaw, opponentsRaw] = await Promise.all([
    fetchJson('games?select=*&order=game_date.asc'),
    fetchJson('opponents?select=id,full_name&order=full_name.asc'),
  ])

  const opponents: OpponentOption[] = Array.isArray(opponentsRaw) ? opponentsRaw : []

  const rows: GameRow[] = (Array.isArray(gamesRaw) ? gamesRaw : []).map((g: any) => ({
    id:              g.id,
    game_date:       g.game_date,
    opponent_id:     g.opponent_id,
    home_away:       g.home_away ?? null,
    round:           g.round ?? null,
    venue:           g.venue ?? null,
    game_type:       (g.game_type ?? 'regular_season') as GameTypeKey,
    team_score:      g.team_score ?? null,
    opponent_score:  g.opponent_score ?? null,
    result:          g.result ?? null,
  }))

  const unassignedCount = rows.filter(r => r.game_type === 'regular_season').length

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 64px',
    }}>
      {/* Header */}
      <div className="px-4 md:px-8 py-5" style={{ background: HEADER, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>
            <a href="/" style={{ color: MUTED, textDecoration: 'none' }}>Overview</a>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ color: '#307b92' }}>Game Setup</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e' }}>Game Setup</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            Configure game type (regular season, finals, tournament, grading, practice) and details for every game.
            {unassignedCount > 0 && (
              <> &nbsp;<strong style={{ color: '#d97706' }}>{unassignedCount} game{unassignedCount === 1 ? '' : 's'}</strong> still set to the default type — review below.</>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-6" style={{ maxWidth: 1160, margin: '0 auto' }}>
        <GamesSetupTable initialRows={rows} opponents={opponents} />
      </div>
    </main>
  )
}

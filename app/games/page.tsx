import Link from 'next/link'
import GamesSetupTable, { type GameRow, type OpponentOption } from './GamesSetupTable'
import type { GameTypeKey } from '../dashboard/filterConfig'
import { fetchRows } from '@/lib/supabaseRest'
import type { GameRow as DbGameRow } from '@/lib/dbTypes'

export const dynamic = 'force-dynamic'

const BG     = '#f4f5f7'
const BORDER = '#e2e5eb'
const HEADER = '#ffffff'
const MUTED  = '#6b7280'

export default async function GamesSetupPage() {
  const [games, opponents] = await Promise.all([
    fetchRows<DbGameRow>('games?select=*&order=game_date.asc'),
    fetchRows<OpponentOption>('opponents?select=id,full_name&order=full_name.asc'),
  ])

  const rows: GameRow[] = games.map(g => ({
    id:              g.id,
    game_date:       g.game_date,
    opponent_id:     g.opponent_id ?? '',
    home_away:       g.home_away ?? null,
    round:           g.round ?? null,
    venue:           g.venue ?? null,
    game_type:       (g.game_type ?? 'regular_season') as GameTypeKey,
    team_score:      g.team_score ?? null,
    opponent_score:  g.opponent_score ?? null,
    result:          g.result ?? null,
    video_urls:      Array.isArray(g.video_urls) ? g.video_urls : null,
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
            <Link href="/" style={{ color: MUTED, textDecoration: 'none' }}>Overview</Link>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ color: '#307b92' }}>Game Config</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e' }}>Game Config</div>
            <Link href="/games/new" style={{
              fontSize: 12, fontWeight: 700, color: '#ffffff', background: '#307b92',
              border: 'none', borderRadius: 8, padding: '8px 16px', textDecoration: 'none', whiteSpace: 'nowrap',
            }}>+ New Game</Link>
          </div>
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

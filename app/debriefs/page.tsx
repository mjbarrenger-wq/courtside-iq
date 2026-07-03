import { Suspense } from 'react'
import type { Metadata } from 'next'
import { FilterBar } from '../dashboard/FilterBar'
import type { FilterKey, GameTypeKey } from '../dashboard/filterConfig'
import { FILTER_CONFIG, GAME_TYPE_CONFIG } from '../dashboard/filterConfig'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Game Debriefs — Courtside IQ' }

const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'
const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function fetchJson(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: 'no-store',
  })
  return res.json()
}

const BG     = '#f4f5f7'
const CARD   = '#ffffff'
const BORDER = '#e2e5eb'
const MUTED  = '#6b7280'
const TEAL   = '#307b92'
const GREEN  = '#059669'
const RED    = '#dc2626'

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  regular_season: { label: 'Regular Season', color: '#374151', bg: '#f4f5f7', border: '#e2e5eb' },
  playoff:        { label: 'Finals',         color: '#b45309', bg: '#fffbeb', border: '#fcd34d' },
  tournament:     { label: 'Tournament',     color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
  grading:        { label: 'Grading',        color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
  practice:       { label: 'Practice',       color: '#4b5563', bg: '#f9fafb', border: '#e5e7eb' },
}

// Sorted most-recent-first — this is a browsing list, not a chronological
// chart, so newest games surface at the top (opposite convention to Trends).
function applyFilter(allGames: any[], filter: FilterKey): any[] {
  const sorted = [...allGames].sort(
    (a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()
  )
  switch (filter) {
    case 'last5':       return sorted.slice(0, 5)
    case 'last10':      return sorted.slice(0, 10)
    case 'wins':        return sorted.filter(g => g.result === 'W')
    case 'losses':      return sorted.filter(g => g.result === 'L')
    case 'close_games': return sorted.filter(g =>
      g.team_score != null && g.opponent_score != null &&
      Math.abs(g.team_score - g.opponent_score) < 6
    )
    default:            return sorted
  }
}

export default async function DebriefsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; type?: string }>
}) {
  const { filter: rawFilter = 'all', type: rawType = 'all_types' } = await searchParams
  const filter   = (FILTER_CONFIG.some(f => f.key === rawFilter) ? rawFilter : 'all') as FilterKey
  const gameType = (GAME_TYPE_CONFIG.some(t => t.key === rawType) ? rawType : 'all_types') as GameTypeKey

  const gamesRaw = await fetchJson(
    `games?team_id=eq.${TEAM_ID}&select=id,game_date,result,team_score,opponent_score,home_away,game_type,opponents(full_name)&order=game_date.asc`
  )
  const allGames = Array.isArray(gamesRaw) ? gamesRaw : []

  let games = applyFilter(allGames, filter)
  if (gameType !== 'all_types') {
    games = games.filter((g: any) => g.game_type === gameType)
  }

  const wins   = games.filter((g: any) => g.result === 'W').length
  const losses = games.filter((g: any) => g.result === 'L').length

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 48px',
    }}>

      {/* Header */}
      <div className="px-4 md:px-7" style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '12px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1f2e', letterSpacing: '0.05em' }}>
              GAME DEBRIEFS
            </div>
            <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
              WGT 12.2 — {games.length} games · {wins}W {losses}L &nbsp;·&nbsp;
              <span style={{ color: TEAL, fontWeight: 700 }}>CMD Sports Analytics</span>
            </div>
          </div>
          <Suspense fallback={<div style={{ width: 200, height: 28 }} />}>
            <FilterBar current={filter} currentType={gameType} />
          </Suspense>
        </div>
      </div>

      <div className="px-4 md:px-7 py-6" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: TEAL }}>ALL GAMES</span>
            <span style={{ fontSize: 10, color: MUTED }}>Click any game to open its debrief</span>
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {games.length === 0 && (
              <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: MUTED }}>
                No games match this filter.
              </div>
            )}
            {games.map((g: any) => {
              const date  = new Date(g.game_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
              const badge = TYPE_BADGE[g.game_type] ?? TYPE_BADGE.regular_season
              const oppName = g.opponents?.full_name ?? 'Unknown'
              return (
                <a key={g.id} href={`/games/${g.id}`} style={{ textDecoration: 'none' }} className="game-row-link">
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 8, gap: 10, flexWrap: 'wrap',
                    background: '#f8f9fb', border: `1px solid ${BORDER}`,
                  }}>
                    <span style={{ fontSize: 11, color: MUTED, width: 84, flexShrink: 0 }}>{date}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, flexShrink: 0,
                      color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
                    }}>{badge.label}</span>
                    <span style={{ fontSize: 12, color: '#374151', flex: 1, minWidth: 140 }}>
                      {g.home_away === 'away' ? '@' : 'vs'} {oppName}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1f2e', width: 70, textAlign: 'center', flexShrink: 0 }}>
                      {g.team_score ?? '—'}–{g.opponent_score ?? '—'}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 800, width: 24, textAlign: 'center', flexShrink: 0,
                      color: g.result === 'W' ? GREEN : g.result === 'L' ? RED : MUTED,
                    }}>{g.result ?? '—'}</span>
                    <span style={{ fontSize: 10, color: TEAL, width: 100, textAlign: 'right', fontWeight: 600, flexShrink: 0 }}>
                      View Debrief →
                    </span>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}

import { Suspense } from 'react'
import BubbleChart, { type PlayerBubble } from './BubbleChart'
import SoWhatPanel from './SoWhatPanel'
import { FilterBar } from '../dashboard/FilterBar'
import { DateSlider } from '../dashboard/DateSlider'
import { GamePicker } from '../dashboard/GamePicker'
import type { PickerGame } from '../dashboard/GamePicker'
import type { FilterKey, GameTypeKey } from '../dashboard/filterConfig'
import { FILTER_CONFIG, GAME_TYPE_CONFIG } from '../dashboard/filterConfig'

export const dynamic = 'force-dynamic'

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'

async function fetchJson(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: 'no-store',
  })
  return res.json()
}

// ── Filter helpers (shared logic with dashboard) ──────────────────────────────
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

function contextLabel(games: any[], filter: FilterKey, isCustom: boolean): string {
  if (!games.length) return 'No games'
  const sorted = [...games].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime()
  )
  const wins   = games.filter(g => g.result === 'W').length
  const losses = games.filter(g => g.result === 'L').length
  const fmt    = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const span   = `${fmt(sorted[0].game_date)} – ${fmt(sorted[sorted.length - 1].game_date)}`
  const label  = isCustom ? 'Custom Range' : (FILTER_CONFIG.find(f => f.key === filter)?.label ?? 'All Games')
  return `${label} · ${games.length} games (${wins}W ${losses}L) · ${span}`
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function PlayerQuadrantsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; type?: string; games?: string }>
}) {
  const { filter: rawFilter = 'all', type: rawType = 'all_types', games: gamesParam } = await searchParams
  const isCustom = !!gamesParam
  const filter   = (FILTER_CONFIG.some(f => f.key === rawFilter) ? rawFilter : 'all') as FilterKey
  const gameType = (GAME_TYPE_CONFIG.some(t => t.key === rawType) ? rawType : 'all_types') as GameTypeKey

  // All games (for slider + picker)
  const allGamesRaw = await fetchJson(
    `games?team_id=eq.${TEAM_ID}&select=id,game_date,result,team_score,opponent_score,game_type,opponents(full_name)&order=game_date.asc`
  )
  const allGames: any[] = Array.isArray(allGamesRaw) ? allGamesRaw : []

  // Apply filter or custom game IDs
  let filteredGames: any[]
  if (isCustom) {
    const specificIds = gamesParam!.split(',').filter(Boolean)
    filteredGames = allGames.filter(g => specificIds.includes(g.id))
  } else {
    filteredGames = applyFilter(allGames, filter)
    if (gameType !== 'all_types') {
      filteredGames = filteredGames.filter(g => g.game_type === gameType)
    }
  }

  const gameIds = filteredGames.map((g: any) => g.id)
  const idList  = gameIds.length ? `(${gameIds.join(',')})` : '()'

  // Fetch players + filtered stats in parallel
  const [players, stats] = await Promise.all([
    fetchJson(
      `players?team_id=eq.${TEAM_ID}&select=id,first_name,last_name,jersey_number&order=jersey_number.asc`
    ),
    gameIds.length
      ? fetchJson(
          `player_game_stats?select=player_id,off_ppp,def_ppp,time_played_seconds&game_id=in.${idList}`
        )
      : Promise.resolve([]),
  ])

  // Aggregate per player across filtered games — exclude players with fewer than 3 games
  const bubbles: PlayerBubble[] = (Array.isArray(players) ? players : [])
    .map((p: any) => {
      const rows = (Array.isArray(stats) ? stats : []).filter(
        (s: any) => s.player_id === p.id && s.off_ppp != null && s.def_ppp != null
      )
      if (rows.length < 3) return null

      const avg = (key: string) =>
        rows.reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0) / rows.length

      const avgSeconds = rows.reduce(
        (s: number, r: any) => s + (Number(r.time_played_seconds) || 0), 0
      ) / rows.length

      return {
        name:      `${p.first_name} ${p.last_name}`,
        firstName: p.first_name,
        jersey:    p.jersey_number,
        off_ppp:   parseFloat(avg('off_ppp').toFixed(3)),
        def_ppp:   parseFloat(avg('def_ppp').toFixed(3)),
        mpg:       parseFloat((avgSeconds / 60).toFixed(2)),
        games:     rows.length,
      } satisfies PlayerBubble
    })
    .filter(Boolean) as PlayerBubble[]

  // Slider + picker data (always full season)
  const sliderGames = allGames.map((g: any) => ({
    id:    g.id,
    label: new Date(g.game_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
  }))

  const pickerGames: PickerGame[] = allGames.map((g: any) => ({
    id:       g.id,
    label:    new Date(g.game_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    opponent: g.opponents?.full_name ?? 'Unknown',
    result:   g.result as 'W' | 'L',
    score:    `${g.team_score}-${g.opponent_score}`,
  }))

  const BG     = '#0f1117'
  const BORDER = '#2e374d'
  const CARD   = '#171c2a'

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#e8eaf0',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 48px',
    }}>

      {/* ── Header ── */}
      <div style={{ background: '#1f2537', borderBottom: `1px solid ${BORDER}`, padding: '12px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#e8eaf0', letterSpacing: '0.05em' }}>
              PLAYER QUADRANTS
            </div>
            <div style={{ fontSize: 12, color: '#6d7894', marginTop: 2 }}>
              WGT 12.2 — {contextLabel(filteredGames, filter, isCustom)} &nbsp;·&nbsp;
              <span style={{ color: '#97cfdc', fontWeight: 700 }}>CMD Sports Analytics</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Suspense fallback={<div style={{ width: 200, height: 28 }} />}>
              <FilterBar current={isCustom ? 'all' : filter} currentType={isCustom ? 'all_types' : gameType} />
            </Suspense>
            <Suspense fallback={<div style={{ width: 100, height: 28 }} />}>
              <GamePicker games={pickerGames} />
            </Suspense>
            <a href={`/dashboard?${gamesParam ? `games=${gamesParam}` : `filter=${filter}`}`} style={{ color: '#e8eaf0', fontSize: 11, textDecoration: 'none', background: '#1e2f45', border: '1px solid #3a5a7a', borderRadius: 20, padding: '5px 11px', fontWeight: 500, whiteSpace: 'nowrap' }}>← Driver Tree</a>
            <a href="/" style={{ color: '#e8eaf0', fontSize: 11, textDecoration: 'none', background: '#1e2f45', border: '1px solid #3a5a7a', borderRadius: 20, padding: '5px 11px', fontWeight: 500, whiteSpace: 'nowrap' }}>← Overview</a>
          </div>
        </div>

        {/* Date slider */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Suspense fallback={<div style={{ width: 280, height: 60 }} />}>
            <DateSlider games={sliderGames} />
          </Suspense>
          {isCustom && (
            <div style={{ fontSize: 11, color: '#97cfdc', fontStyle: 'italic' }}>
              Custom range active — use quick filters or Reset to clear
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '24px 28px' }}>

        {/* ── Bubble chart card ── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '24px 20px' }}>
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e8eaf0' }}>
              Player Offensive vs Defensive PPP
            </div>
            <div style={{ fontSize: 12, color: '#6d7894', marginTop: 4 }}>
              Bubble size represents average minutes per game &nbsp;·&nbsp; Quadrants split by team average
            </div>
          </div>
          {bubbles.length > 0
            ? <BubbleChart players={bubbles} />
            : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#6d7894', fontSize: 13 }}>
                No player data available for the selected games.
              </div>
            )}
        </div>

        {/* ── So what panel ── */}
        {bubbles.length > 0 && <SoWhatPanel players={bubbles} />}

        {/* ── Summary table ── */}
        <div style={{ marginTop: 20, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#97cfdc' }}>PLAYER SUMMARY</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#1f2537' }}>
                {['#', 'Player', 'Games', 'Off PPP', 'Def PPP', 'Net PPP', 'MPG'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px',
                    textAlign: h === 'Player' ? 'left' : 'center',
                    fontSize: 10, fontWeight: 700, color: '#6d7894',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    borderBottom: `1px solid ${BORDER}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...bubbles]
                .sort((a, b) => (b.off_ppp - b.def_ppp) - (a.off_ppp - a.def_ppp))
                .map((p, i) => {
                  const net    = p.off_ppp - p.def_ppp
                  const netPos = net >= 0
                  const mins   = Math.floor(p.mpg)
                  const secs   = Math.round((p.mpg % 1) * 60).toString().padStart(2, '0')
                  return (
                    <tr key={p.name} style={{
                      borderBottom: `1px solid ${BORDER}`,
                      background: i % 2 === 0 ? 'transparent' : '#1f2537',
                    }}>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6d7894' }}>#{p.jersey}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#e8eaf0' }}>{p.name}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#a0a8bc' }}>{p.games}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#97cfdc', fontWeight: 600 }}>{p.off_ppp.toFixed(3)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#7a9eb5', fontWeight: 600 }}>{p.def_ppp.toFixed(3)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: netPos ? '#34d399' : '#f87171' }}>
                        {netPos ? '+' : ''}{net.toFixed(3)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#a0a8bc' }}>{mins}:{secs}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

      </div>
    </main>
  )
}

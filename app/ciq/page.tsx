import { Suspense } from 'react'
import Link from 'next/link'
import { FilterBar } from '../dashboard/FilterBar'
import { DateSlider } from '../dashboard/DateSlider'
import { GamePicker } from '../dashboard/GamePicker'
import type { PickerGame } from '../dashboard/GamePicker'
import type { FilterKey, GameTypeKey } from '../dashboard/filterConfig'
import { FILTER_CONFIG, GAME_TYPE_CONFIG } from '../dashboard/filterConfig'
import PrintButton from './PrintButton'

export const dynamic = 'force-dynamic'

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'

const BG = '#f4f5f7', CARD = '#ffffff', BORDER = '#e2e5eb'
const TEAL = '#307b92', SEC = '#374151', MUTED = '#6b7280'
const GREEN = '#059669', RED = '#dc2626', AMBER = '#d97706'

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchJson(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: 'no-store',
  })
  return res.json()
}

const arr = (x: any) => (Array.isArray(x) ? x : [])
const shortOpp = (name?: string) => (name ? name.split(' ')[0] : 'Opp')
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

// ── Game filtering (shared logic with the dashboard / quadrants pages) ──────────
function applyFilter(allGames: any[], filter: FilterKey): any[] {
  const sorted = [...allGames].sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime())
  switch (filter) {
    case 'last5':       return sorted.slice(0, 5)
    case 'last10':      return sorted.slice(0, 10)
    case 'wins':        return sorted.filter(g => g.result === 'W')
    case 'losses':      return sorted.filter(g => g.result === 'L')
    case 'close_games': return sorted.filter(g => g.team_score != null && g.opponent_score != null && Math.abs(g.team_score - g.opponent_score) < 6)
    default:            return sorted
  }
}
function contextLabel(games: any[], filter: FilterKey, isCustom: boolean): string {
  if (!games.length) return 'No games'
  const sorted = [...games].sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())
  const wins = games.filter(g => g.result === 'W').length
  const losses = games.filter(g => g.result === 'L').length
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const span = `${fmt(sorted[0].game_date)} – ${fmt(sorted[sorted.length - 1].game_date)}`
  const label = isCustom ? 'Custom Range' : (FILTER_CONFIG.find(f => f.key === filter)?.label ?? 'All Games')
  return `${label} · ${games.length} games (${wins}W ${losses}L) · ${span}`
}

interface GameLite { id: string; game_date: string; result?: string; opponents?: { full_name?: string } }
interface PGame { ciq: number; points: number; secs: number; game: GameLite }
interface Row {
  id: string; name: string; jersey: number
  seasonCiq: number; games: number; best: PGame; worst: PGame
  series: number[]; avgPts: number; mpg: number
}

// A tiny 0-baseline sparkline of a player's per-game CIQ across the filtered games.
// Renders at 100% of its container width (viewBox math stays in fixed logical units)
// so the same component works in a narrow fixed-width desktop cell or a full-width
// mobile card without separate mobile/desktop implementations.
function Sparkline({ series, height = 30 }: { series: number[]; height?: number }) {
  const w = 200, h = height, pad = 3
  if (series.length < 2) {
    return <div style={{ width: '100%', height: h, fontSize: 10, color: MUTED, display: 'flex', alignItems: 'center' }}>—</div>
  }
  const min = Math.min(0, ...series), max = Math.max(0, ...series)
  const span = max - min || 1
  const x = (i: number) => pad + (i / (series.length - 1)) * (w - 2 * pad)
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad)
  const zeroY = y(0)
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = series[series.length - 1]
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="#e2e5eb" strokeWidth="1" strokeDasharray="2 2" />
      <polyline points={pts} fill="none" stroke={TEAL} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(series.length - 1)} cy={y(last)} r="2.4" fill={last >= 0 ? GREEN : RED} />
    </svg>
  )
}

export default async function CiqLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; type?: string; games?: string }>
}) {
  const { filter: rawFilter = 'all', type: rawType = 'all_types', games: gamesParam } = await searchParams
  const isCustom = !!gamesParam
  const filter = (FILTER_CONFIG.some(f => f.key === rawFilter) ? rawFilter : 'all') as FilterKey
  const gameType = (GAME_TYPE_CONFIG.some(t => t.key === rawType) ? rawType : 'all_types') as GameTypeKey

  const allGames: any[] = arr(await fetchJson(
    `games?team_id=eq.${TEAM_ID}&select=id,game_date,result,team_score,opponent_score,game_type,opponents(full_name)&order=game_date.asc`,
  ))

  let filteredGames: any[]
  if (isCustom) {
    const ids = gamesParam!.split(',').filter(Boolean)
    filteredGames = allGames.filter(g => ids.includes(g.id))
  } else {
    filteredGames = applyFilter(allGames, filter)
    if (gameType !== 'all_types') filteredGames = filteredGames.filter(g => g.game_type === gameType)
  }
  const gameIds = filteredGames.map(g => g.id)
  const idList = gameIds.length ? `(${gameIds.join(',')})` : '()'
  const gameById = new Map<string, GameLite>(filteredGames.map(g => [g.id, g]))

  const [playersRaw, statsRaw] = await Promise.all([
    fetchJson(`players?team_id=eq.${TEAM_ID}&select=id,first_name,last_name,jersey_number&order=jersey_number.asc`),
    gameIds.length
      ? fetchJson(`player_game_stats?select=player_id,game_id,ciq_rating,points,time_played_seconds&game_id=in.${idList}`)
      : Promise.resolve([]),
  ])
  const players = arr(playersRaw), stats = arr(statsRaw)

  const rows: Row[] = players.map((p: any): Row | null => {
    const pg: PGame[] = stats
      .filter((s: any) => s.player_id === p.id && s.ciq_rating != null)
      .map((s: any) => ({ ciq: Number(s.ciq_rating), points: Number(s.points) || 0, secs: Number(s.time_played_seconds) || 0, game: gameById.get(s.game_id)! }))
      .filter((s: PGame) => s.game)
      .sort((a: PGame, b: PGame) => new Date(a.game.game_date).getTime() - new Date(b.game.game_date).getTime())
    if (!pg.length) return null
    const seasonCiq = pg.reduce((s, x) => s + x.ciq, 0) / pg.length
    const best = pg.reduce((m, x) => (x.ciq > m.ciq ? x : m), pg[0])
    const worst = pg.reduce((m, x) => (x.ciq < m.ciq ? x : m), pg[0])
    return {
      id: p.id, name: `${p.first_name} ${p.last_name}`, jersey: p.jersey_number,
      seasonCiq: +seasonCiq.toFixed(1), games: pg.length, best, worst, series: pg.map(x => x.ciq),
      avgPts: pg.reduce((s, x) => s + x.points, 0) / pg.length,
      mpg: pg.reduce((s, x) => s + x.secs, 0) / pg.length / 60,
    }
  }).filter(Boolean) as Row[]

  rows.sort((a, b) => b.seasonCiq - a.seasonCiq)
  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.seasonCiq)))

  const sliderGames = allGames.map(g => ({ id: g.id, label: fmtDate(g.game_date) }))
  const pickerGames: PickerGame[] = allGames.map(g => ({
    id: g.id, label: fmtDate(g.game_date), opponent: g.opponents?.full_name ?? 'Unknown',
    result: g.result as 'W' | 'L', score: `${g.team_score}-${g.opponent_score}`,
  }))

  return (
    <main style={{ background: BG, minHeight: '100vh', color: '#1a1f2e', fontFamily: "'Inter', system-ui, sans-serif", WebkitFontSmoothing: 'antialiased', paddingBottom: 60 }}>
      {/* Print / PDF: A4 landscape (the leaderboard is wide). Hides the nav + filter
          controls + button, keeps the ranked list, prints colours exactly. */}
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        @media print {
          nav { display: none !important; }
          .no-print { display: none !important; }
          .ciq-print-only { display: block !important; }
          main { background: #fff !important; padding: 0 !important; min-height: 0 !important; }
          .ciq-content { max-width: 100% !important; padding: 0 !important; }
          .ciq-row { break-inside: avoid; }
          /* Print always uses the desktop table layout, regardless of the viewport
             width the page happened to render at (responsive classes alone can't be
             trusted for print, so force it explicitly). */
          .ciq-mobile-row { display: none !important; }
          .ciq-desktop-row { display: flex !important; }
          .ciq-desktop-header { display: flex !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, padding: '12px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.05em' }}>CIQ LEADERBOARD</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              WGT 12.2 — {contextLabel(filteredGames, filter, isCustom)} &nbsp;·&nbsp;
              <span style={{ color: TEAL, fontWeight: 700 }}>CMD Sports Analytics</span>
            </div>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Suspense fallback={<div style={{ width: 200, height: 28 }} />}>
              <FilterBar current={isCustom ? 'all' : filter} currentType={isCustom ? 'all_types' : gameType} />
            </Suspense>
            <Suspense fallback={<div style={{ width: 100, height: 28 }} />}>
              <GamePicker games={pickerGames} />
            </Suspense>
            <PrintButton />
          </div>
        </div>
        <div className="no-print" style={{ marginTop: 10 }}>
          <Suspense fallback={<div style={{ width: 280, height: 60 }} />}>
            <DateSlider games={sliderGames} />
          </Suspense>
        </div>
      </div>

      <div className="ciq-content" style={{ maxWidth: 1000, margin: '0 auto', padding: '22px 24px 0' }}>
        {/* What CIQ is */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${TEAL}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: TEAL, marginBottom: 6 }}>What CIQ measures</div>
          <p style={{ fontSize: 13, color: SEC, lineHeight: 1.6, margin: '0 0 8px' }}>
            <strong>CIQ Rating</strong> is Courtside IQ&rsquo;s single value metric — <strong>points of value per 100 possessions</strong>.
            It blends an individual box estimate (scoring above or below the team&rsquo;s own break-even rate this season, plus credit for assists,
            rebounds, steals and blocks, minus turnovers and fouls) with the team&rsquo;s net scoring while the player is on the floor.
          </p>
          <p className="no-print" style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Higher is better; around zero is break-even (neutral value). It&rsquo;s box-dominant right now — the on-court half earns weight as
            more games get full play-by-play. <Link href="/glossary" style={{ color: TEAL, fontWeight: 700, textDecoration: 'none' }}>Full definition in the glossary →</Link>
          </p>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: MUTED, fontSize: 13 }}>No CIQ data for the selected games.</div>
        ) : (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
            {/* Column header — desktop table only; the mobile card layout below labels
                itself inline (PPG · mpg · GP), so a matching header row isn't needed. */}
            <div className="ciq-desktop-header hidden md:flex" style={{ alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: `1px solid ${BORDER}`, background: '#f0f2f7', fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <span style={{ width: 26 }}>#</span>
              <span style={{ flex: 1 }}>Player</span>
              <span style={{ width: 92, textAlign: 'right' }}>Season CIQ</span>
              <span style={{ width: 140 }}>Per-game trend</span>
              <span style={{ width: 200 }}>Best / worst game</span>
              <span style={{ width: 44, textAlign: 'right' }}>GP</span>
            </div>

            {rows.map((r, i) => {
              const barPct = Math.round((Math.abs(r.seasonCiq) / maxAbs) * 100)
              const pos = r.seasonCiq >= 0
              const color = pos ? TEAL : RED
              return (
                <div key={r.id} className="ciq-row" style={{ borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none', background: i % 2 ? '#f8f9fb' : 'transparent' }}>

                  {/* ── Mobile: stacked card ── */}
                  <div className="ciq-mobile-row flex md:hidden" style={{ flexDirection: 'column', gap: 8, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 20, flexShrink: 0, fontSize: 13, fontWeight: 800, color: i === 0 ? AMBER : MUTED }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1f2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name} <span style={{ color: MUTED, fontWeight: 600, fontSize: 11 }}>#{r.jersey}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 1 }}>{r.avgPts.toFixed(1)} PPG · {Math.floor(r.mpg)} mpg · {r.games} GP</div>
                      </div>
                      <span style={{ flexShrink: 0, fontSize: 22, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>
                        {pos ? '' : '−'}{Math.abs(r.seasonCiq).toFixed(1)}
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#eef1f6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                    <div style={{ height: 26 }}>
                      <Sparkline series={r.series} height={26} />
                    </div>
                    <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.6 }}>
                      <div><span style={{ color: GREEN, fontWeight: 700 }}>{r.best.ciq.toFixed(1)}</span> vs {shortOpp(r.best.game.opponents?.full_name)} <span style={{ color: '#aeb4bf' }}>{fmtDate(r.best.game.game_date)}</span></div>
                      <div><span style={{ color: RED, fontWeight: 700 }}>{r.worst.ciq.toFixed(1)}</span> vs {shortOpp(r.worst.game.opponents?.full_name)} <span style={{ color: '#aeb4bf' }}>{fmtDate(r.worst.game.game_date)}</span></div>
                    </div>
                  </div>

                  {/* ── Desktop: single-line table row ── */}
                  <div className="ciq-desktop-row hidden md:flex" style={{ alignItems: 'center', gap: 12, padding: '12px 18px' }}>
                    <span style={{ width: 26, fontSize: 14, fontWeight: 800, color: i === 0 ? AMBER : MUTED }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1f2e', whiteSpace: 'nowrap' }}>{r.name}</span>
                        <span style={{ fontSize: 11, color: MUTED }}>#{r.jersey}</span>
                        <span style={{ fontSize: 11, color: MUTED }}>· {r.avgPts.toFixed(1)} PPG · {Math.floor(r.mpg)} mpg</span>
                      </div>
                      <div style={{ marginTop: 5, height: 6, background: '#eef1f6', borderRadius: 3, overflow: 'hidden', maxWidth: 320 }}>
                        <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 3 }} />
                      </div>
                    </div>
                    <span style={{ width: 92, textAlign: 'right', fontSize: 22, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>
                      {pos ? '' : '−'}{Math.abs(r.seasonCiq).toFixed(1)}
                    </span>
                    <div style={{ width: 140 }}>
                      <Sparkline series={r.series} />
                    </div>
                    <div style={{ width: 200, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                      <div><span style={{ color: GREEN, fontWeight: 700 }}>{r.best.ciq.toFixed(1)}</span> vs {shortOpp(r.best.game.opponents?.full_name)} <span style={{ color: '#aeb4bf' }}>{fmtDate(r.best.game.game_date)}</span></div>
                      <div><span style={{ color: RED, fontWeight: 700 }}>{r.worst.ciq.toFixed(1)}</span> vs {shortOpp(r.worst.game.opponents?.full_name)} <span style={{ color: '#aeb4bf' }}>{fmtDate(r.worst.game.game_date)}</span></div>
                    </div>
                    <span style={{ width: 44, textAlign: 'right', fontSize: 13, color: MUTED, fontWeight: 600 }}>{r.games}</span>
                  </div>

                </div>
              )
            })}
          </div>
        )}

        <div style={{ fontSize: 11, color: MUTED, marginTop: 12 }}>
          Season CIQ is the average of a player&rsquo;s per-game ratings across the selected games. GP = games with a rating.
        </div>
      </div>
    </main>
  )
}

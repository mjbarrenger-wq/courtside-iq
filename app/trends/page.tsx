import type { Metadata } from 'next'
import { TrendChart, type GamePoint } from './TrendChart'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Season Trend — Courtside IQ' }

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

export default async function TrendsPage() {
  const [gamesRaw, oppStatsRaw] = await Promise.all([
    fetchJson(`games?team_id=eq.${TEAM_ID}&select=id,game_date,result,team_score,opponent_score,opponents(full_name)&order=game_date.asc`),
    fetchJson(`opponent_game_stats?select=game_id,opp_off_ppp,opp_def_ppp`),
  ])

  const games = Array.isArray(gamesRaw) ? gamesRaw : []
  const oppStatsByGame: Record<string, { opp_off_ppp: number; opp_def_ppp: number }> = {}
  if (Array.isArray(oppStatsRaw)) {
    for (const r of oppStatsRaw) oppStatsByGame[r.game_id] = r
  }

  const gamePoints: GamePoint[] = games.map((g: any, i: number) => {
    const s   = oppStatsByGame[g.id]
    // opp_def_ppp = how well they defended us = our Off PPP
    // opp_off_ppp = how well they attacked us = our Def PPP
    const offPpp = s?.opp_def_ppp != null ? Number(s.opp_def_ppp) : null
    const defPpp = s?.opp_off_ppp != null ? Number(s.opp_off_ppp) : null
    const netPpp = offPpp != null && defPpp != null
      ? Math.round((offPpp - defPpp) * 1000) / 1000
      : null
    return {
      index:     i,
      gameId:    g.id,
      date:      g.game_date,
      opponent:  g.opponents?.full_name ?? 'Unknown',
      result:    g.result as 'W' | 'L',
      teamScore: g.team_score ?? 0,
      oppScore:  g.opponent_score ?? 0,
      offPpp,
      defPpp,
      netPpp,
    }
  })

  const wins   = games.filter((g: any) => g.result === 'W').length
  const losses = games.filter((g: any) => g.result === 'L').length

  // First half vs second half split
  const withData   = gamePoints.filter(g => g.netPpp != null)
  const mid        = Math.floor(withData.length / 2)
  const firstHalf  = withData.slice(0, mid)
  const secondHalf = withData.slice(withData.length - mid)

  function halfAvg(arr: GamePoint[], key: 'offPpp' | 'defPpp' | 'netPpp') {
    const valid = arr.filter(g => g[key] != null)
    if (valid.length === 0) return null
    return Math.round((valid.reduce((s, g) => s + (g[key] as number), 0) / valid.length) * 1000) / 1000
  }

  const splitMetrics = [
    { label: 'Off PPP', key: 'offPpp' as const, color: '#307b92', higherBetter: true },
    { label: 'Def PPP', key: 'defPpp' as const, color: '#e05555', higherBetter: false },
    { label: 'Net PPP', key: 'netPpp' as const, color: '#059669', higherBetter: true },
  ]

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 48px',
    }}>

      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '12px 28px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1f2e', letterSpacing: '0.05em' }}>
          SEASON TREND
        </div>
        <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
          WGT 12.2 — {games.length} games · {wins}W {losses}L &nbsp;·&nbsp;
          <span style={{ color: '#307b92', fontWeight: 700 }}>CMD Sports Analytics</span>
        </div>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Main chart card */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '24px 28px', marginBottom: 20 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1f2e' }}>PPP by Game — Full Season</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
              Points per possession · hover any game for details · dashed lines show 3-game rolling average
            </div>
          </div>
          <TrendChart games={gamePoints} />
        </div>

        {/* First half vs second half */}
        {mid >= 3 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1f2e', marginBottom: 12 }}>
              Season Trajectory
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {splitMetrics.map(m => {
                const f = halfAvg(firstHalf, m.key)
                const s = halfAvg(secondHalf, m.key)
                if (f == null || s == null) return null
                const diff      = Math.round((s - f) * 1000) / 1000
                const improving = m.higherBetter ? diff > 0.005 : diff < -0.005
                const declining = m.higherBetter ? diff < -0.005 : diff > 0.005
                const flat      = !improving && !declining
                return (
                  <div key={m.key} style={{
                    background: CARD, border: `1px solid ${BORDER}`,
                    borderTop: `3px solid ${m.color}`,
                    borderRadius: 12, padding: '18px 20px',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: m.color, letterSpacing: '0.06em', marginBottom: 12 }}>
                      {m.label}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>First {mid} games</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: '#1a1f2e', lineHeight: 1 }}>
                          {f.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ fontSize: 20, color: '#d1d5db', alignSelf: 'center' }}>→</div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>Last {mid} games</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: '#1a1f2e', lineHeight: 1 }}>
                          {s.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, textAlign: 'center', borderRadius: 6, padding: '5px 10px',
                      color:      improving ? '#059669' : declining ? '#dc2626' : '#6b7280',
                      background: improving ? '#ecfdf5' : declining ? '#fef2f2' : '#f4f5f7',
                      border:     `1px solid ${improving ? '#a7f3d0' : declining ? '#fca5a5' : '#e2e5eb'}`,
                    }}>
                      {improving ? '↑ Improving' : declining ? '↓ Declining' : '→ Stable'}
                      &nbsp;
                      <span style={{ fontWeight: 400 }}>
                        ({diff >= 0 ? '+' : ''}{diff.toFixed(2)})
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}

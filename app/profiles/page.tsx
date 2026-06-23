import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Player Profiles — Courtside IQ' }

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

const POSITION_COLOR: Record<string, string> = {
  PG: '#307b92', SG: '#307b92',
  SF: '#059669',
  PF: '#d97706', C: '#d97706',
}

export default async function ProfilesPage() {
  const [playersRaw, statsRaw] = await Promise.all([
    fetchJson(`players?team_id=eq.${TEAM_ID}&select=id,first_name,last_name,jersey_number,primary_positions,secondary_positions&order=jersey_number.asc`),
    fetchJson(`player_game_stats?select=player_id,points,twopt_made,twopt_att,threept_made,threept_att,ft_made,ft_att,oreb,dreb,ast,stl,blk,turnovers`),
  ])

  const players = Array.isArray(playersRaw) ? playersRaw : []
  const stats   = Array.isArray(statsRaw)   ? statsRaw   : []

  const roster = players.map((p: any) => {
    const rows  = stats.filter((r: any) => r.player_id === p.id)
    const gp    = rows.length
    const sum   = (k: string) => rows.reduce((s: number, r: any) => s + (Number(r[k]) || 0), 0)
    const avg   = (k: string) => gp > 0 ? Math.round((sum(k) / gp) * 10) / 10 : 0
    const fgAtt = sum('twopt_att') + sum('threept_att')
    const fgMade= sum('twopt_made') + sum('threept_made')
    const pts   = sum('points')
    const tsDenom = 2 * (fgAtt + 0.44 * sum('ft_att'))
    return {
      id:       p.id,
      name:     `${p.first_name} ${p.last_name}`,
      first:    p.first_name,
      jersey:   p.jersey_number,
      primary:  (p.primary_positions ?? []) as string[],
      secondary:(p.secondary_positions ?? []) as string[],
      gp,
      ppg:  avg('points'),
      rpg:  Math.round(((sum('oreb') + sum('dreb')) / Math.max(gp, 1)) * 10) / 10,
      apg:  avg('ast'),
      spg:  avg('stl'),
      fg:   fgAtt  > 0 ? Math.round((fgMade  / fgAtt)  * 1000) / 10 : null,
      ts:   tsDenom> 0 ? Math.round((pts      / tsDenom)* 1000) / 10 : null,
    }
  })

  const BG     = '#f4f5f7'
  const CARD   = '#ffffff'
  const BORDER = '#e2e5eb'

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 48px',
    }}>
      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '12px 28px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1f2e', letterSpacing: '0.05em' }}>
          PLAYER PROFILES
        </div>
        <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
          WGT 12.2 — {roster.length} players &nbsp;·&nbsp;
          <span style={{ color: '#307b92', fontWeight: 700 }}>CMD Sports Analytics</span>
        </div>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 14,
        }}>
          {roster.map(p => {
            const mainPos = p.primary[0] ?? null
            const posColor = mainPos ? (POSITION_COLOR[mainPos] ?? '#6b7280') : '#6b7280'
            return (
              <a
                key={p.id}
                href={`/players/${p.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div style={{
                  background: CARD,
                  border: `1px solid ${BORDER}`,
                  borderTop: `3px solid ${posColor}`,
                  borderRadius: 12,
                  padding: '18px 18px 16px',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                }}>
                  {/* Jersey + name */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: posColor, lineHeight: 1 }}>
                      #{p.jersey}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#1a1f2e', lineHeight: 1 }}>
                      {p.first}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
                    {p.name.split(' ')[1]}
                  </div>

                  {/* Position badges */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
                    {p.primary.map((pos: string) => (
                      <span key={pos} style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px',
                        background: posColor + '18', border: `1px solid ${posColor}`,
                        borderRadius: 4, color: posColor, letterSpacing: '0.04em',
                      }}>{pos}</span>
                    ))}
                    {p.secondary.map((pos: string) => (
                      <span key={pos} style={{
                        fontSize: 9, fontWeight: 600, padding: '2px 6px',
                        background: '#f4f5f7', border: '1px solid #e2e5eb',
                        borderRadius: 4, color: '#6b7280', letterSpacing: '0.04em',
                      }}>{pos}</span>
                    ))}
                  </div>

                  {/* Key stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px' }}>
                    {[
                      { label: 'PPG',  value: p.gp > 0 ? p.ppg.toFixed(1) : '—' },
                      { label: 'RPG',  value: p.gp > 0 ? p.rpg.toFixed(1) : '—' },
                      { label: 'FG%',  value: p.fg != null ? `${p.fg}%` : '—' },
                      { label: 'TS%',  value: p.ts != null ? `${p.ts}%` : '—' },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.06em' }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1f2e', lineHeight: 1.2 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 12, fontSize: 10, color: posColor, fontWeight: 600, letterSpacing: '0.04em' }}>
                    {p.gp} games · View profile →
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </main>
  )
}

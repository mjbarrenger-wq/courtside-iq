'use client'

import { useState } from 'react'
import HalfCourt, { type Shot } from './HalfCourt'

// A shot carries pts (2 or 3) so 3-pointers are classed by what they were logged
// as, not by geometry; geometry only splits 2-pointers into rim / paint / mid.
type ZoneKey = 'rim' | 'paint' | 'mid' | 'three'
const ZONES: { key: ZoneKey; label: string }[] = [
  { key: 'rim', label: 'At the rim' },
  { key: 'paint', label: 'Paint (non-rim)' },
  { key: 'mid', label: 'Mid-range' },
  { key: 'three', label: 'Three' },
]

// Court geometry mirrors HalfCourt: 150×140 units (10 = 1 m), basket at (75, 15.75),
// key is x 50.5–99.5 × y 0–58. Normalized shot x,y → court units.
function zoneOf(s: Shot): ZoneKey {
  if (s.pts === 3) return 'three'
  const cx = s.x * 150, cy = s.y * 140
  const dist = Math.hypot(cx - 75, cy - 15.75)
  if (dist <= 20) return 'rim'                       // within ~2 m of the basket
  if (cx >= 50.5 && cx <= 99.5 && cy <= 58) return 'paint'
  return 'mid'
}

interface ZoneStat { made: number; att: number }
function tally(shots: Shot[]): Record<ZoneKey, ZoneStat> {
  const z: Record<ZoneKey, ZoneStat> = {
    rim: { made: 0, att: 0 }, paint: { made: 0, att: 0 },
    mid: { made: 0, att: 0 }, three: { made: 0, att: 0 },
  }
  for (const s of shots) {
    const k = zoneOf(s)
    z[k].att++
    if (s.made) z[k].made++
  }
  return z
}

const TEAL = '#307b92', BORDER = '#e2e5eb', MUTED = '#6b7280', GREEN = '#059669', RED = '#dc2626'
const pctStr = (m: number, a: number) => (a ? `${Math.round((m / a) * 100)}%` : '—')

export default function ShotChart({
  ourShots, oppShots, teamLabel, oppLabel,
}: {
  ourShots: Shot[]
  oppShots: Shot[]
  teamLabel: string
  oppLabel: string
}) {
  const hasOpp = oppShots.length > 0
  const [view, setView] = useState<'us' | 'opp'>('us')
  const shots = view === 'opp' ? oppShots : ourShots
  const z = tally(shots)

  const made = shots.filter(s => s.made).length
  const att = shots.length
  // eFG% over located shots: (FGM + 0.5·3PM) / FGA.
  const threeMade = shots.filter(s => s.made && s.pts === 3).length
  const efg = att ? Math.round(((made + 0.5 * threeMade) / att) * 100) : 0

  const Toggle = ({ v, label }: { v: 'us' | 'opp'; label: string }) => (
    <button
      onClick={() => setView(v)}
      style={{
        padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        borderRadius: 7, border: `1px solid ${view === v ? TEAL : BORDER}`,
        background: view === v ? TEAL : '#fff', color: view === v ? '#fff' : MUTED,
      }}
    >{label}</button>
  )

  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEAL }}>SHOT CHART</span>
        <span style={{ fontSize: 12, color: MUTED }}>
          {made}/{att} FG · {pctStr(made, att)} · eFG {efg}%
        </span>
        {hasOpp && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <Toggle v="us" label={teamLabel} />
            <Toggle v="opp" label={oppLabel} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,320px)_1fr]" style={{ gap: 20, padding: 20, alignItems: 'start' }}>
        {/* court */}
        <div>
          <HalfCourt shots={shots} maxHeight={340} />
          <div style={{ marginTop: 8, fontSize: 11, color: MUTED }}>
            <span style={{ color: GREEN, fontWeight: 700 }}>● made</span>
            {' · '}
            <span style={{ color: RED, fontWeight: 700 }}>✕ missed</span>
            {' · located shots only'}
          </div>
        </div>

        {/* zone stats */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', rowGap: 2, columnGap: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.06em' }}>ZONE</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textAlign: 'right' }}>FG</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textAlign: 'right' }}>%</div>
            {ZONES.map(zn => {
              const st = z[zn.key]
              const p = st.att ? st.made / st.att : 0
              return (
                <div key={zn.key} style={{ display: 'contents' }}>
                  <div style={{ fontSize: 13, color: '#1a1f2e', paddingTop: 6, borderTop: `1px solid ${BORDER}` }}>{zn.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', paddingTop: 6, borderTop: `1px solid ${BORDER}`, color: st.att ? '#1a1f2e' : MUTED }}>
                    {st.att ? `${st.made}/${st.att}` : '—'}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, textAlign: 'right', paddingTop: 6, borderTop: `1px solid ${BORDER}`, color: !st.att ? MUTED : p >= 0.5 ? GREEN : p >= 0.33 ? '#1a1f2e' : RED }}>
                    {pctStr(st.made, st.att)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

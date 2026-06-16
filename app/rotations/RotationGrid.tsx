'use client'
// Rotation Grid — Visual display of the 8-slot rotation plan
// Shows 4 quarters × 2 slots with 5 player chips per slot
// TODO: implement full visual grid

import type { RotationPlayer, OptimiserResult } from './types'

interface Props {
  result: OptimiserResult
  players: RotationPlayer[]
}

const CARD = '#171c2a'
const BORDER = '#2e374d'

export default function RotationGrid({ result, players }: Props) {
  const playerMap = new Map(players.map(p => [p.id, p]))

  const quarters = [1, 2, 3, 4] as const
  const slots = ['A', 'B'] as const

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* TODO: full grid implementation per ROTATIONS.md UI wireframe */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {quarters.map(q => (
          <div key={q} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#97cfdc', marginBottom: 12 }}>
              QUARTER {q}
            </div>
            {slots.map(s => {
              const slot = result.plan.find(sl => sl.quarter === q && sl.slot === s)
              return (
                <div key={s} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#6d7894', marginBottom: 6 }}>
                    Slot {s} (~min {s === 'A' ? '0–5' : '5–10'})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {slot?.playerIds.map(id => {
                      const p = playerMap.get(id)
                      return p ? (
                        <span key={id} style={{
                          background: '#1f2537', border: `1px solid ${BORDER}`,
                          borderRadius: 20, padding: '3px 8px', fontSize: 11,
                          color: '#e8eaf0', fontWeight: 600,
                        }}>
                          #{p.jersey} {p.firstName}
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Sub call summary */}
      <div style={{ marginTop: 16, padding: '12px 16px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: '#a0a8bc' }}>
          Sub calls to ref: {result.subCallsPerQuarter.map((n, i) => `Q${i+1}: ${n}`).join(' | ')} = {result.totalSubCalls} total
        </span>
      </div>

      {result.warnings.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8 }}>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fbbf24' }}>&#9888; {w}</div>
          ))}
        </div>
      )}
    </div>
  )
}

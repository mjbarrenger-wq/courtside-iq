'use client'

import { useState } from 'react'

export interface PlayerDrill {
  id: string
  pillar: string
  name: string
  difficulty: string
  duration_mins: number
  players_min: number
  players_max: number
  equipment: string | null
  setup: string
  execution: string
  coaching_cues: string[]
  progression: string | null
  tags: string[]
}

const PILLAR_COLORS: Record<string, string> = {
  shot_efficiency:     '#307b92',
  possession_control:  '#307b92',
  extra_possessions:   '#1e6a82',
  pressure_creation:   '#d97706',
  shot_suppression:    '#059669',
  possession_ending:   '#059669',
  pressure_disruption: '#d97706',
  discipline:          '#dc2626',
}

const PILLAR_LABELS: Record<string, string> = {
  shot_efficiency:     'Shot Efficiency',
  possession_control:  'Possession Control',
  extra_possessions:   'Second Chances',
  pressure_creation:   'Rim Pressure',
  shot_suppression:    'Shot Suppression',
  possession_ending:   'Possession Ending',
  pressure_disruption: 'Pressure & Disruption',
  discipline:          'Discipline',
}

const DIFFICULTY_CFG: Record<string, { label: string; color: string }> = {
  foundation:  { label: 'Foundation',  color: '#059669' },
  developing:  { label: 'Developing',  color: '#d97706' },
  competitive: { label: 'Competitive', color: '#dc2626' },
}

const BORDER = '#e2e5eb'

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function DrillCard({ drill }: { drill: PlayerDrill }) {
  const [open, setOpen] = useState(false)
  const color = PILLAR_COLORS[drill.pillar] ?? '#307b92'
  const label = PILLAR_LABELS[drill.pillar] ?? drill.pillar
  const diff  = DIFFICULTY_CFG[drill.difficulty] ?? { label: drill.difficulty, color: '#307b92' }

  return (
    <div style={{
      background: '#ffffff',
      border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Header / click target */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '12px 14px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
            <span style={{ color: '#1a1f2e', fontWeight: 600, fontSize: 13 }}>{drill.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              background: diff.color + '22', color: diff.color,
              border: `1px solid ${diff.color}44`,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>{diff.label}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 99,
              background: color + '22', color,
              border: `1px solid ${color}44`,
            }}>{label}</span>
            <span style={{ fontSize: 10, color: '#6b7280' }}>⏱ {drill.duration_mins} min</span>
            <span style={{ fontSize: 10, color: '#6b7280' }}>👥 {drill.players_min}–{drill.players_max}</span>
          </div>
        </div>
        <span style={{
          color: '#6b7280', fontSize: 16, flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
          marginTop: 2,
        }}>▾</span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${BORDER}` }}>
          {drill.equipment && (
            <p style={{ fontSize: 11, color: '#6b7280', margin: '8px 0 0' }}>
              Equipment: {drill.equipment}
            </p>
          )}
          <Section label="Setup">
            <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0 }}>{drill.setup}</p>
          </Section>
          <Section label="Execution">
            <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0 }}>{drill.execution}</p>
          </Section>
          {drill.coaching_cues.length > 0 && (
            <Section label="Coaching Cues">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {drill.coaching_cues.map((cue, i) => (
                  <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <span style={{ color, flexShrink: 0, marginTop: 1, fontSize: 11 }}>▸</span>
                    <span style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{cue}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {drill.progression && (
            <Section label="Progression">
              <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0 }}>{drill.progression}</p>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

export default function PlayerDrillCards({ drills }: { drills: PlayerDrill[] }) {
  if (drills.length === 0) {
    return (
      <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: 0 }}>
        No matching drills found. Check the Drills Library for all available drills.
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {drills.map(drill => <DrillCard key={drill.id} drill={drill} />)}
    </div>
  )
}

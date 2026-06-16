'use client'

import { useState } from 'react'

export interface DashboardDrill {
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
  shot_efficiency:     '#97cfdc',
  possession_control:  '#97cfdc',
  extra_possessions:   '#7a9eb5',
  pressure_creation:   '#fbbf24',
  shot_suppression:    '#34d399',
  possession_ending:   '#34d399',
  pressure_disruption: '#fbbf24',
  discipline:          '#f87171',
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
  foundation:  { label: 'Foundation',  color: '#34d399' },
  developing:  { label: 'Developing',  color: '#f59e0b' },
  competitive: { label: 'Competitive', color: '#f87171' },
}

const BORDER = '#2e374d'

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#6d7894',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function DrillCard({ drill }: { drill: DashboardDrill }) {
  const [open, setOpen] = useState(false)
  const color = PILLAR_COLORS[drill.pillar] ?? '#97cfdc'
  const label = PILLAR_LABELS[drill.pillar] ?? drill.pillar
  const diff  = DIFFICULTY_CFG[drill.difficulty] ?? { label: drill.difficulty, color: '#97cfdc' }

  return (
    <div style={{
      background: '#171c2a',
      border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
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
            <span style={{ color: '#e8f4f8', fontWeight: 600, fontSize: 13 }}>{drill.name}</span>
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
              background: color + '22', color, border: `1px solid ${color}44`,
            }}>{label}</span>
            <span style={{ fontSize: 10, color: '#6d7894' }}>⏱ {drill.duration_mins} min</span>
            <span style={{ fontSize: 10, color: '#6d7894' }}>👥 {drill.players_min}–{drill.players_max}</span>
          </div>
        </div>
        <span style={{
          color: '#6d7894', fontSize: 16, flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s', marginTop: 2,
        }}>▾</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid #1a3a5a' }}>
          {drill.equipment && (
            <p style={{ fontSize: 11, color: '#6d7894', margin: '8px 0 0' }}>
              Equipment: {drill.equipment}
            </p>
          )}
          <Section label="Setup">
            <p style={{ fontSize: 12, color: '#b0d0e0', lineHeight: 1.6, margin: 0 }}>{drill.setup}</p>
          </Section>
          <Section label="Execution">
            <p style={{ fontSize: 12, color: '#b0d0e0', lineHeight: 1.6, margin: 0 }}>{drill.execution}</p>
          </Section>
          {drill.coaching_cues.length > 0 && (
            <Section label="Coaching Cues">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {drill.coaching_cues.map((cue, i) => (
                  <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <span style={{ color, flexShrink: 0, marginTop: 1, fontSize: 11 }}>▸</span>
                    <span style={{ fontSize: 12, color: '#d0e8f0', lineHeight: 1.5 }}>{cue}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {drill.progression && (
            <Section label="Progression">
              <p style={{ fontSize: 12, color: '#b0d0e0', lineHeight: 1.6, margin: 0 }}>{drill.progression}</p>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

export default function DashboardDrillCards({ drills }: { drills: DashboardDrill[] }) {
  if (drills.length === 0) {
    return (
      <p style={{ fontSize: 12, color: '#6d7894', fontStyle: 'italic', margin: 0 }}>
        No matching drills found.{' '}
        <a href="/drills" style={{ color: '#97cfdc', textDecoration: 'none' }}>Browse the full library →</a>
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {drills.map(drill => <DrillCard key={drill.id} drill={drill} />)}
    </div>
  )
}

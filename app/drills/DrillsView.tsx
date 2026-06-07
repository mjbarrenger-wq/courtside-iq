'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Drill } from './page'

// ── Config ──────────────────────────────────────────────────────────────────

const PILLAR_CONFIG: Record<string, { label: string; color: string; side: 'offence' | 'defence' }> = {
  shot_efficiency:    { label: 'Shot Efficiency',      color: '#307b92', side: 'offence' },
  possession_control: { label: 'Possession Control',   color: '#4a6fa5', side: 'offence' },
  extra_possessions:  { label: 'Extra Possessions',    color: '#8b5cf6', side: 'offence' },
  pressure_creation:  { label: 'Pressure Creation',    color: '#f59e0b', side: 'offence' },
  shot_suppression:   { label: 'Shot Suppression',     color: '#ef4444', side: 'defence' },
  possession_ending:  { label: 'Possession Ending',    color: '#10b981', side: 'defence' },
  pressure_disruption:{ label: 'Pressure & Disruption',color: '#e879f9', side: 'defence' },
  discipline:         { label: 'Discipline',           color: '#6366f1', side: 'defence' },
}

const DIFFICULTY_CONFIG = {
  foundation:  { label: 'Foundation', color: '#10b981', order: 1 },
  developing:  { label: 'Developing', color: '#f59e0b', order: 2 },
  competitive: { label: 'Competitive',color: '#ef4444', order: 3 },
}

// Priority tier based on delta
function getPriority(delta: number): 'high' | 'medium' | 'low' {
  if (delta < -3) return 'high'
  if (delta < 2)  return 'medium'
  return 'low'
}

const PRIORITY_LABEL: Record<string, string> = {
  high:   '🔴 Priority',
  medium: '🟡 Focus',
  low:    '🟢 Strength',
}

const PRIORITY_COLOR: Record<string, string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#10b981',
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  drills: Drill[]
  pillarDeltaMap: Record<string, number>
}

type DifficultyFilter = 'all' | 'foundation' | 'developing' | 'competitive'

// ── Drill Card ───────────────────────────────────────────────────────────────

function DrillCard({ drill, delta }: { drill: Drill; delta: number }) {
  const [open, setOpen] = useState(false)
  const config  = PILLAR_CONFIG[drill.pillar]
  const diffCfg = DIFFICULTY_CONFIG[drill.difficulty]
  const priority = getPriority(delta)

  return (
    <div style={{
      background: '#0d1b2e',
      border: `1px solid #2a4a6e`,
      borderLeft: `3px solid ${PRIORITY_COLOR[priority]}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Card header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '14px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top row: name + difficulty badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ color: '#e8f4f8', fontWeight: 600, fontSize: 14 }}>
              {drill.name}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              background: diffCfg.color + '22', color: diffCfg.color,
              border: `1px solid ${diffCfg.color}44`, textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {diffCfg.label}
            </span>
          </div>
          {/* Meta row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 99,
              background: config.color + '22', color: config.color,
              border: `1px solid ${config.color}44`,
            }}>
              {config.label}
            </span>
            <span style={{ fontSize: 11, color: '#5a8fa8' }}>
              ⏱ {drill.duration_mins} min
            </span>
            <span style={{ fontSize: 11, color: '#5a8fa8' }}>
              👥 {drill.players_min}–{drill.players_max} players
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: PRIORITY_COLOR[priority],
            }}>
              {PRIORITY_LABEL[priority]}
            </span>
          </div>
        </div>
        {/* Expand chevron */}
        <span style={{
          color: '#5a8fa8', fontSize: 16, flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
          marginTop: 2,
        }}>▾</span>
      </button>

      {/* Expanded content */}
      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #1a3a5a' }}>
          {/* Why recommended */}
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: PRIORITY_COLOR[priority] + '15',
            border: `1px solid ${PRIORITY_COLOR[priority]}33`,
            borderRadius: 6, marginBottom: 14,
          }}>
            <span style={{ fontSize: 11, color: PRIORITY_COLOR[priority], fontWeight: 600 }}>
              WHY RECOMMENDED
            </span>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#a8c8d8', lineHeight: 1.5 }}>
              {config.label} delta: {delta > 0 ? '+' : ''}{delta}
              {delta < 0
                ? ` — this is a leakage area. Prioritise this pillar at training.`
                : ` — this is a team strength. Maintain with regular reps.`}
            </p>
          </div>

          {/* Setup */}
          <Section label="Setup">
            {drill.equipment && (
              <p style={{ fontSize: 12, color: '#5a8fa8', marginBottom: 4 }}>
                Equipment: {drill.equipment}
              </p>
            )}
            <p style={{ fontSize: 13, color: '#b0d0e0', lineHeight: 1.6 }}>{drill.setup}</p>
          </Section>

          {/* Execution */}
          <Section label="Execution">
            <p style={{ fontSize: 13, color: '#b0d0e0', lineHeight: 1.6 }}>{drill.execution}</p>
          </Section>

          {/* Coaching Cues */}
          <Section label="Coaching Cues">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {drill.coaching_cues.map((cue, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: config.color, flexShrink: 0, marginTop: 2 }}>▸</span>
                  <span style={{ fontSize: 13, color: '#d0e8f0', lineHeight: 1.5 }}>{cue}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Progression */}
          {drill.progression && (
            <Section label="Progression">
              <p style={{ fontSize: 13, color: '#b0d0e0', lineHeight: 1.6 }}>{drill.progression}</p>
            </Section>
          )}

          {/* Tags */}
          {drill.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {drill.tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 10, padding: '1px 7px', borderRadius: 99,
                  background: '#1a3a5a', color: '#5a8fa8',
                  border: '1px solid #2a4a6e',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#5a8fa8', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 5 }}>
        {label}
      </p>
      {children}
    </div>
  )
}

// ── Main View ────────────────────────────────────────────────────────────────

export default function DrillsView({ drills, pillarDeltaMap }: Props) {
  const [activePillar, setActivePillar] = useState<string>('all')
  const [activeDiff, setActiveDiff]   = useState<DifficultyFilter>('all')
  const [sortByRecommended, setSortByRecommended] = useState(true)

  const drillList = Array.isArray(drills) ? drills : []

  // Filter
  const filtered = drillList.filter(d => {
    if (activePillar !== 'all' && d.pillar !== activePillar) return false
    if (activeDiff   !== 'all' && d.difficulty !== activeDiff) return false
    return true
  })

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortByRecommended) {
      // Worst delta first (most need for improvement)
      const da = pillarDeltaMap[a.pillar] ?? 0
      const db = pillarDeltaMap[b.pillar] ?? 0
      if (da !== db) return da - db   // ascending: most negative first
      // Within same pillar, foundation → developing → competitive
      return a.difficulty_order - b.difficulty_order
    }
    // Default: pillar alphabetical + difficulty order
    if (a.pillar !== b.pillar) return a.pillar.localeCompare(b.pillar)
    return a.difficulty_order - b.difficulty_order
  })

  // Priority summary for header
  const priorityPillars = Object.entries(pillarDeltaMap)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)

  return (
    <div style={{ minHeight: '100vh', background: '#07111e', color: '#e8f4f8', fontFamily: 'system-ui, sans-serif' }}>
      {/* Nav */}
      <div style={{
        borderBottom: '1px solid #1a3a5a', padding: '14px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <Link href="/" style={{ color: '#5a8fa8', textDecoration: 'none', fontSize: 13 }}>
          ← Home
        </Link>
        <span style={{ color: '#1a3a5a' }}>|</span>
        <span style={{ color: '#e8f4f8', fontWeight: 600, fontSize: 15 }}>Drills Library</span>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e8f4f8', margin: 0 }}>
            Drills Library
          </h1>
          <p style={{ color: '#5a8fa8', fontSize: 13, marginTop: 6 }}>
            80 drills across 8 performance pillars — recommended by driver tree insights.
          </p>
        </div>

        {/* Priority strip */}
        <div style={{
          background: '#0d1b2e', border: '1px solid #2a4a6e', borderRadius: 8,
          padding: '14px 18px', marginBottom: 24,
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#5a8fa8', textTransform: 'uppercase',
                      letterSpacing: '0.08em', margin: '0 0 10px' }}>
            Training Priorities This Week
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {priorityPillars.map(([key, delta]) => {
              const cfg = PILLAR_CONFIG[key]
              const priority = getPriority(delta)
              return (
                <button
                  key={key}
                  onClick={() => { setActivePillar(key); setSortByRecommended(true) }}
                  style={{
                    background: PRIORITY_COLOR[priority] + '15',
                    border: `1px solid ${PRIORITY_COLOR[priority]}44`,
                    borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[priority] }}>
                    {PRIORITY_LABEL[priority]}
                  </span>
                  <span style={{ fontSize: 12, color: '#e8f4f8' }}>{cfg?.label}</span>
                  <span style={{ fontSize: 11, color: '#5a8fa8' }}>
                    Delta: {delta > 0 ? '+' : ''}{delta}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {/* Sort toggle */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setSortByRecommended(true)}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                background: sortByRecommended ? '#307b92' : 'transparent',
                color: sortByRecommended ? '#fff' : '#5a8fa8',
                border: `1px solid ${sortByRecommended ? '#307b92' : '#2a4a6e'}`,
              }}
            >
              Recommended First
            </button>
            <button
              onClick={() => setSortByRecommended(false)}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                background: !sortByRecommended ? '#307b92' : 'transparent',
                color: !sortByRecommended ? '#fff' : '#5a8fa8',
                border: `1px solid ${!sortByRecommended ? '#307b92' : '#2a4a6e'}`,
              }}
            >
              Browse All
            </button>
          </div>

          {/* Difficulty filter */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['all', 'foundation', 'developing', 'competitive'] as const).map(d => (
              <button
                key={d}
                onClick={() => setActiveDiff(d)}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                  textTransform: 'capitalize',
                  background: activeDiff === d
                    ? (d === 'all' ? '#2a4a6e' : DIFFICULTY_CONFIG[d]?.color + '33')
                    : 'transparent',
                  color: activeDiff === d
                    ? (d === 'all' ? '#e8f4f8' : DIFFICULTY_CONFIG[d]?.color)
                    : '#5a8fa8',
                  border: `1px solid ${activeDiff === d
                    ? (d === 'all' ? '#3a6a9e' : DIFFICULTY_CONFIG[d]?.color + '66')
                    : '#2a4a6e'}`,
                }}
              >
                {d === 'all' ? 'All Levels' : DIFFICULTY_CONFIG[d].label}
              </button>
            ))}
          </div>

          {/* Pillar filter */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setActivePillar('all')}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                background: activePillar === 'all' ? '#2a4a6e' : 'transparent',
                color: activePillar === 'all' ? '#e8f4f8' : '#5a8fa8',
                border: `1px solid ${activePillar === 'all' ? '#3a6a9e' : '#2a4a6e'}`,
              }}
            >
              All Pillars
            </button>
            {Object.entries(PILLAR_CONFIG).map(([key, cfg]) => {
              const delta = pillarDeltaMap[key] ?? 0
              const priority = getPriority(delta)
              return (
                <button
                  key={key}
                  onClick={() => setActivePillar(key)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                    background: activePillar === key ? cfg.color + '33' : 'transparent',
                    color: activePillar === key ? cfg.color : '#5a8fa8',
                    border: `1px solid ${activePillar === key ? cfg.color + '66' : '#2a4a6e'}`,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: PRIORITY_COLOR[priority], flexShrink: 0,
                  }} />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Count */}
        <p style={{ fontSize: 12, color: '#5a8fa8', marginBottom: 16 }}>
          Showing {sorted.length} drill{sorted.length !== 1 ? 's' : ''}
          {activePillar !== 'all' && ` · ${PILLAR_CONFIG[activePillar]?.label}`}
          {activeDiff !== 'all' && ` · ${DIFFICULTY_CONFIG[activeDiff].label}`}
        </p>

        {/* Drills list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map(drill => (
            <DrillCard
              key={drill.id}
              drill={drill}
              delta={pillarDeltaMap[drill.pillar] ?? 0}
            />
          ))}
        </div>

        {sorted.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: '#5a8fa8', background: '#0d1b2e',
            border: '1px solid #2a4a6e', borderRadius: 8,
          }}>
            No drills match the current filters.
          </div>
        )}
      </div>
    </div>
  )
}

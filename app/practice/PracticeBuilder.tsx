'use client'

import { useState, useTransition } from 'react'
import { generatePracticePlan, type GeneratedPlan, type PlanBlock, type PillarDrillData } from './actions'

interface Pillar {
  name: string
  delta: number
}

interface Props {
  allPillars: Pillar[]
  leakagePillars: string[]
  drillsByPillar: Record<string, PillarDrillData[]>
  teamContext: { record: string; netPpp: number; games: number }
  pillarDeltas: Record<string, number>
}

const PHASE_COLORS: Record<string, string> = {
  warmup:      '#307b92',
  skill:       '#1a1f2e',
  competitive: '#059669',
  cooldown:    '#9ca3af',
}

const PILLAR_COLORS: Record<string, string> = {
  'Shot Efficiency':     '#307b92',
  'Possession Control':  '#307b92',
  'Second Chances':      '#1e6a82',
  'Rim Pressure':        '#d97706',
  'Shot Suppression':    '#059669',
  'Possession Ending':   '#059669',
  'Possession Creation': '#d97706',
  'Discipline':          '#dc2626',
}

const PHASE_LABEL: Record<string, string> = {
  warmup:      'WARM-UP',
  skill:       'SKILL',
  competitive: 'COMPETITIVE',
  cooldown:    'COOL-DOWN',
}

const BG     = '#f4f5f7'
const CARD   = '#ffffff'
const BORDER = '#e2e5eb'
const TEAL   = '#307b92'
const SEC    = '#374151'
const MUTED  = '#6b7280'

function blockColor(block: PlanBlock): string {
  if (block.phase === 'skill' && block.pillar) {
    return PILLAR_COLORS[block.pillar] ?? TEAL
  }
  return PHASE_COLORS[block.phase] ?? TEAL
}

function Timeline({ blocks }: { blocks: PlanBlock[] }) {
  const total = blocks.reduce((s, b) => s + b.duration, 0)
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 36, border: `1px solid ${BORDER}` }}>
        {blocks.map((b, i) => {
          const pct = (b.duration / total) * 100
          const color = blockColor(b)
          return (
            <div
              key={i}
              title={`${b.title} — ${b.duration} min`}
              style={{
                width: `${pct}%`,
                background: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: i < blocks.length - 1 ? '1px solid rgba(255,255,255,0.25)' : 'none',
                overflow: 'hidden',
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: '#ffffff', letterSpacing: '0.04em', whiteSpace: 'nowrap', padding: '0 4px', textAlign: 'center' }}>
                {b.duration}m
              </span>
            </div>
          )
        })}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        {blocks.map((b, i) => {
          const color = blockColor(b)
          const label = b.phase === 'skill' && b.pillar ? b.pillar : b.title
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: MUTED }}>{label} ({b.duration}m)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DrillItem({ drill, color }: { drill: { name: string; duration: number; instruction: string; coachingCue: string }; color: string }) {
  return (
    <div style={{
      background: BG,
      border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 6,
      padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1f2e' }}>{drill.name}</span>
        <span style={{
          fontSize: 10, color: MUTED, fontWeight: 600,
          background: CARD, border: `1px solid ${BORDER}`,
          padding: '1px 7px', borderRadius: 99,
        }}>
          {drill.duration} min
        </span>
      </div>
      <p style={{ fontSize: 12, color: SEC, lineHeight: 1.6, margin: '0 0 6px' }}>{drill.instruction}</p>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color, flexShrink: 0, marginTop: 1 }}>▸ CUE</span>
        <span style={{ fontSize: 12, fontStyle: 'italic', color: '#374151', lineHeight: 1.5 }}>{drill.coachingCue}</span>
      </div>
    </div>
  )
}

function BlockCard({ block }: { block: PlanBlock }) {
  const color = blockColor(block)
  return (
    <div style={{
      background: CARD,
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* Block header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          background: color,
          borderRadius: 4,
          padding: '3px 8px',
          fontSize: 9,
          fontWeight: 800,
          color: '#ffffff',
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {PHASE_LABEL[block.phase] ?? block.phase.toUpperCase()}
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1f2e', flex: 1 }}>{block.title}</span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: MUTED,
          background: BG, border: `1px solid ${BORDER}`,
          padding: '3px 10px', borderRadius: 99, whiteSpace: 'nowrap',
        }}>
          {block.duration} min
        </span>
      </div>

      {/* Drills */}
      {block.drills && block.drills.length > 0 && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {block.drills.map((drill, i) => (
            <DrillItem key={i} drill={drill} color={color} />
          ))}
        </div>
      )}

      {/* Key instruction */}
      {block.keyInstruction && (
        <div style={{
          margin: '0 16px 12px',
          padding: '8px 12px',
          background: color + '10',
          border: `1px solid ${color}30`,
          borderRadius: 6,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.06em' }}>KEY INSTRUCTION</span>
          <p style={{ fontSize: 12, color: SEC, margin: '4px 0 0', lineHeight: 1.6 }}>{block.keyInstruction}</p>
        </div>
      )}
    </div>
  )
}

export default function PracticeBuilder({
  allPillars,
  leakagePillars,
  drillsByPillar,
  teamContext,
  pillarDeltas,
}: Props) {
  const [duration, setDuration] = useState<60 | 90>(60)
  const [selected, setSelected] = useState<Set<string>>(new Set(leakagePillars.slice(0, 2)))
  const [plan, setPlan] = useState<GeneratedPlan | null>(null)
  const [isPending, startTransition] = useTransition()

  const togglePillar = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        if (next.size >= 3) return prev  // max 3
        next.add(name)
      }
      return next
    })
  }

  const handleGenerate = () => {
    const selectedList = [...selected]
    startTransition(async () => {
      const result = await generatePracticePlan(
        selectedList,
        drillsByPillar,
        duration,
        teamContext,
        pillarDeltas,
      )
      setPlan(result)
    })
  }

  const totalMinutes = plan ? plan.blocks.reduce((s, b) => s + b.duration, 0) : 0

  return (
    <div>
      {/* Setup Panel */}
      <div className="p-4 md:px-6 md:py-5" style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1f2e', marginBottom: 4 }}>Session Setup</div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 18 }}>
          Select up to 3 focus areas. The top leakage areas are pre-selected based on season data.
        </div>

        {/* Duration toggle */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Session Length
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([60, 90] as const).map(d => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className="min-h-[44px] md:min-h-0"
                style={{
                  padding: '7px 20px',
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: `1px solid ${duration === d ? TEAL : BORDER}`,
                  background: duration === d ? '#e8f4f8' : CARD,
                  color: duration === d ? TEAL : SEC,
                }}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>

        {/* Pillar selection */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Focus Areas &nbsp;
            <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>({selected.size}/3 selected)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
            {allPillars.map(({ name, delta }) => {
              const isSelected = selected.has(name)
              const isLeakage = delta < 0
              const pillarColor = PILLAR_COLORS[name] ?? TEAL
              const disabled = !isSelected && selected.size >= 3
              return (
                <button
                  key={name}
                  onClick={() => !disabled && togglePillar(name)}
                  disabled={disabled}
                  className="min-h-[44px] md:min-h-0"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${isSelected ? pillarColor : BORDER}`,
                    background: isSelected ? (pillarColor + '12') : CARD,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.45 : 1,
                    textAlign: 'left',
                  }}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: `2px solid ${isSelected ? pillarColor : '#d1d5db'}`,
                    background: isSelected ? pillarColor : CARD,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isSelected ? '#1a1f2e' : SEC }}>{name}</div>
                  </div>
                  {/* Delta badge */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                    color: isLeakage ? '#dc2626' : '#059669',
                  }}>
                    {delta > 0 ? '+' : ''}{delta}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isPending || selected.size === 0}
          style={{
            padding: '10px 28px',
            background: (isPending || selected.size === 0) ? '#e2e5eb' : TEAL,
            color: (isPending || selected.size === 0) ? MUTED : '#ffffff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            cursor: (isPending || selected.size === 0) ? 'not-allowed' : 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          {isPending ? 'Building plan…' : 'Build Session Plan'}
        </button>
      </div>

      {/* Loading state */}
      {isPending && (
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: '32px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>⏱</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1f2e', marginBottom: 4 }}>Building your session plan…</div>
          <div style={{ fontSize: 12, color: MUTED }}>Mapping drills to priority areas</div>
        </div>
      )}

      {/* Generated Plan */}
      {!isPending && plan && plan.blocks.length > 0 && (
        <div>
          {/* Plan header */}
          <div style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: TEAL, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Session Theme
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', lineHeight: 1.2 }}>{plan.theme}</div>
              </div>
              <div style={{
                background: '#1a1f2e',
                borderRadius: 8,
                padding: '8px 16px',
                textAlign: 'center',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', lineHeight: 1 }}>{totalMinutes}</div>
                <div style={{ fontSize: 10, color: '#9ca3af', letterSpacing: '0.06em' }}>MIN</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: SEC, lineHeight: 1.7, margin: 0 }}>{plan.coachingNote}</p>

            {/* Timeline */}
            <div style={{ marginTop: 16 }}>
              <Timeline blocks={plan.blocks} />
            </div>
          </div>

          {/* Block-by-block */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plan.blocks.map((block, i) => (
              <BlockCard key={i} block={block} />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {!isPending && plan && plan.blocks.length === 0 && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
          padding: '20px 24px', color: '#dc2626',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Plan generation failed</div>
          <div style={{ fontSize: 12 }}>{plan.coachingNote}</div>
        </div>
      )}
    </div>
  )
}

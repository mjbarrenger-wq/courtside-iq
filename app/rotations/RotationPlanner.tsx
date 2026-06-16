'use client'
// Rotation Planner — Interactive constraint input and optimisation trigger

import { useState, useMemo } from 'react'
import type { RotationPlayer, PlayerConstraint, OptimiserResult, Position } from './types'
import { solve } from './optimiser'
import RotationGrid from './RotationGrid'

interface Props {
  players: RotationPlayer[]
  teamId: string
}

const CARD    = '#171c2a'
const BORDER  = '#2e374d'
const BG      = '#0f1117'
const TEAL    = '#97cfdc'
const MUTED   = '#6d7894'
const SEC     = '#a0a8bc'
const PRIMARY = '#e8eaf0'
const GREEN   = '#34d399'
const RED     = '#f87171'
const AMBER   = '#fbbf24'

const ALL_POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C']

// ── Position chip editor ──────────────────────────────────────────────────────

function PositionEditor({
  primary, secondary, onChange,
}: {
  primary: Position[]
  secondary: Position[]
  onChange: (primary: Position[], secondary: Position[]) => void
}) {
  function togglePos(pos: Position, tier: 'primary' | 'secondary') {
    if (tier === 'primary') {
      const next = primary.includes(pos) ? primary.filter(p => p !== pos) : [...primary, pos]
      // Can't be both primary and secondary
      onChange(next, secondary.filter(p => !next.includes(p)))
    } else {
      const next = secondary.includes(pos) ? secondary.filter(p => p !== pos) : [...secondary, pos]
      onChange(primary.filter(p => !next.includes(p)), next)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {ALL_POSITIONS.map(pos => {
        const isPrimary   = primary.includes(pos)
        const isSecondary = secondary.includes(pos)
        const chipBg  = isPrimary ? TEAL : isSecondary ? 'rgba(151,207,220,0.15)' : BG
        const chipCol = isPrimary ? '#0f1117' : isSecondary ? TEAL : MUTED
        const chipBdr = isPrimary || isSecondary ? TEAL : BORDER
        return (
          <div key={pos} style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
            <button
              title="Set as primary position"
              onClick={() => togglePos(pos, 'primary')}
              style={{
                background: chipBg, border: `1px solid ${chipBdr}`, borderRadius: '4px 4px 0 0',
                padding: '3px 7px', fontSize: 10, fontWeight: 700, color: chipCol,
                cursor: 'pointer', minWidth: 30, lineHeight: 1.4,
              }}
            >{pos}</button>
            <button
              title="Set as secondary position (can fill if needed)"
              onClick={() => togglePos(pos, 'secondary')}
              style={{
                background: isSecondary ? 'rgba(151,207,220,0.1)' : BG,
                border: `1px solid ${isSecondary ? TEAL : BORDER}`,
                borderRadius: '0 0 4px 4px',
                padding: '1px 7px', fontSize: 8, fontWeight: 600,
                color: isSecondary ? TEAL : MUTED,
                cursor: 'pointer', minWidth: 30, lineHeight: 1.4,
              }}
            >2nd</button>
          </div>
        )
      })}
    </div>
  )
}

// ── Number input ──────────────────────────────────────────────────────────────

function NumInput({ value, min, max, step = 5, onChange }: {
  value: number; min: number; max: number; step?: number
  onChange: (v: number) => void
}) {
  return (
    <input
      type="number" min={min} max={max} step={step} value={value}
      onChange={e => {
        const v = Math.max(min, Math.min(max, Number(e.target.value)))
        onChange(v)
      }}
      style={{
        width: 52, background: BG, border: `1px solid ${BORDER}`,
        borderRadius: 6, padding: '4px 8px', color: PRIMARY, fontSize: 13,
        fontVariantNumeric: 'tabular-nums',
      }}
    />
  )
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Check({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <input
      type="checkbox" checked={checked} disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      style={{
        accentColor: TEAL, width: 16, height: 16,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
      }}
    />
  )
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultConstraints(players: RotationPlayer[]): PlayerConstraint[] {
  return players.map(p => ({
    playerId:             p.id,
    isStarter:            false,
    isCloser:             false,
    minMinutes:           10,
    maxMinutes:           40,
    mustPlayEveryQuarter: false,
    unavailable:          false,
  }))
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RotationPlanner({ players: initialPlayers, teamId: _teamId }: Props) {
  const [players, setPlayers]         = useState<RotationPlayer[]>(initialPlayers)
  const [constraints, setConstraints] = useState<PlayerConstraint[]>(defaultConstraints(initialPlayers))
  const [result, setResult]           = useState<OptimiserResult | null>(null)
  const [showPositions, setShowPositions] = useState(false)

  // Derived counts
  const starterCount = useMemo(() => constraints.filter(c => c.isStarter && !c.unavailable).length, [constraints])
  const closerCount  = useMemo(() => constraints.filter(c => c.isCloser  && !c.unavailable).length, [constraints])

  const availablePlayers  = useMemo(() => players.filter(p => !constraints.find(c => c.playerId === p.id)?.unavailable), [players, constraints])
  const everyQCount       = useMemo(() => constraints.filter(c => c.mustPlayEveryQuarter && !c.unavailable).length, [constraints])
  const allEveryQ         = availablePlayers.length > 0 && everyQCount === availablePlayers.length

  function updateConstraint(playerId: string, update: Partial<PlayerConstraint>) {
    setConstraints(prev => prev.map(c => c.playerId === playerId ? { ...c, ...update } : c))
  }

  function updatePlayerPositions(playerId: string, primaryPositions: Position[], secondaryPositions: Position[]) {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, primaryPositions, secondaryPositions } : p))
  }

  function toggleAllEveryQ() {
    const newVal = !allEveryQ
    setConstraints(prev => prev.map(c => {
      const isAvailable = !c.unavailable
      return isAvailable ? { ...c, mustPlayEveryQuarter: newVal } : c
    }))
  }

  function generate() {
    const res = solve(players, constraints)
    setResult(res)
  }

  const canGenerate = starterCount <= 5 && closerCount <= 5

  return (
    <div style={{ color: PRIMARY, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Constraint table ── */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEAL, letterSpacing: '0.05em' }}>
            PLAYER CONSTRAINTS
          </div>
          <button
            onClick={() => setShowPositions(v => !v)}
            style={{
              background: showPositions ? TEAL : BG,
              border: `1px solid ${showPositions ? TEAL : BORDER}`,
              borderRadius: 6, padding: '5px 14px', fontSize: 11,
              fontWeight: 600, color: showPositions ? '#0f1117' : SEC,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {showPositions ? '✓ Editing Positions' : 'Edit Positions'}
          </button>
        </div>

        {/* Validation badges */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: `${starterCount}/5 Starters`, ok: starterCount <= 5 },
            { label: `${closerCount}/5 Closers`,   ok: closerCount <= 5  },
            { label: `${everyQCount} Every-Quarter`, ok: true, accent: TEAL },
          ].map(({ label, ok, accent }) => (
            <span key={label} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: accent ? `${accent}1a` : ok ? `${GREEN}1a` : `${RED}1a`,
              border: `1px solid ${accent ?? (ok ? GREEN : RED)}`,
              color: accent ?? (ok ? GREEN : RED),
            }}>{label}</span>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10 }}>#</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10 }}>Player</th>
                {showPositions && (
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10, minWidth: 240 }}>
                    Positions <span style={{ color: MUTED, fontSize: 9, fontWeight: 400 }}>(top = primary · 2nd = secondary)</span>
                  </th>
                )}
                <th style={{ padding: '8px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10 }}>Min Mins</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10 }}>Max Mins</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10 }}>
                  Starter <span style={{ color: MUTED, fontSize: 8, fontWeight: 400 }}>max 5</span>
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10 }}>
                  Closer <span style={{ color: MUTED, fontSize: 8, fontWeight: 400 }}>max 5</span>
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    Every Q
                    <button
                      onClick={toggleAllEveryQ}
                      title={allEveryQ ? 'Deselect all' : 'Select all available players'}
                      style={{
                        background: allEveryQ ? TEAL : BG,
                        border: `1px solid ${allEveryQ ? TEAL : BORDER}`,
                        borderRadius: 4, padding: '1px 6px',
                        fontSize: 9, fontWeight: 700,
                        color: allEveryQ ? '#0f1117' : MUTED,
                        cursor: 'pointer', lineHeight: 1.5,
                      }}
                    >{allEveryQ ? 'All ✓' : 'All'}</button>
                  </span>
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 10 }}>Out</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p => {
                const c = constraints.find(c => c.playerId === p.id)!
                return (
                  <tr key={p.id} style={{
                    borderBottom: `1px solid ${BORDER}`,
                    opacity: c.unavailable ? 0.35 : 1,
                    transition: 'opacity 0.15s',
                  }}>
                    <td style={{ padding: '10px 10px', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                      #{p.jersey}
                    </td>
                    <td style={{ padding: '10px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {p.name}
                      {!showPositions && p.primaryPositions.length > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: MUTED, fontWeight: 400 }}>
                          {p.primaryPositions.join('/')}
                          {p.secondaryPositions.length > 0 && ` (${p.secondaryPositions.join('/')})`}
                        </span>
                      )}
                    </td>

                    {showPositions && (
                      <td style={{ padding: '8px 10px' }}>
                        <PositionEditor
                          primary={p.primaryPositions}
                          secondary={p.secondaryPositions}
                          onChange={(pri, sec) => updatePlayerPositions(p.id, pri, sec)}
                        />
                      </td>
                    )}

                    <td style={{ padding: '10px 10px' }}>
                      <NumInput
                        value={c.minMinutes} min={0} max={c.maxMinutes} step={5}
                        onChange={v => updateConstraint(p.id, { minMinutes: v })}
                      />
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <NumInput
                        value={c.maxMinutes} min={c.minMinutes} max={40} step={5}
                        onChange={v => updateConstraint(p.id, { maxMinutes: v })}
                      />
                    </td>

                    <td style={{ padding: '10px 10px' }}>
                      <Check
                        checked={c.isStarter}
                        disabled={!c.isStarter && starterCount >= 5}
                        onChange={v => updateConstraint(p.id, { isStarter: v })}
                      />
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <Check
                        checked={c.isCloser}
                        disabled={!c.isCloser && closerCount >= 5}
                        onChange={v => updateConstraint(p.id, { isCloser: v })}
                      />
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <Check
                        checked={c.mustPlayEveryQuarter}
                        onChange={v => updateConstraint(p.id, { mustPlayEveryQuarter: v })}
                      />
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <Check
                        checked={c.unavailable}
                        onChange={v => updateConstraint(p.id, { unavailable: v })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {showPositions && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: BG, borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 11, color: MUTED }}>
            Click the position label to set it as <strong style={{ color: SEC }}>primary</strong> (fully comfortable).
            Click <strong style={{ color: SEC }}>2nd</strong> to mark it as a <strong style={{ color: SEC }}>secondary</strong> position (can fill if needed).
            A player can hold multiple primaries. Changes take effect on the next Generate.
          </div>
        )}
      </div>

      {/* ── Lineup continuity note ── */}
      <div style={{
        marginBottom: 20, padding: '10px 16px',
        background: 'rgba(151,207,220,0.06)',
        border: `1px solid rgba(151,207,220,0.2)`,
        borderRadius: 8, fontSize: 12, color: SEC,
      }}>
        <strong style={{ color: TEAL }}>Lineup continuity:</strong> At most 2 players rotate out between any two consecutive slots — at least 3 carry over. This prevents a full 5-for-5 swap and keeps game flow consistent.
      </div>

      {/* ── Validation errors ── */}
      {starterCount > 5 && (
        <div style={{ marginBottom: 10, color: RED, fontSize: 12 }}>
          ⚠ {starterCount} starters selected — maximum is 5. Deselect {starterCount - 5} before generating.
        </div>
      )}
      {closerCount > 5 && (
        <div style={{ marginBottom: 10, color: RED, fontSize: 12 }}>
          ⚠ {closerCount} closers selected — maximum is 5. Deselect {closerCount - 5} before generating.
        </div>
      )}

      {/* ── Generate ── */}
      <button
        onClick={generate}
        disabled={!canGenerate}
        style={{
          background: canGenerate ? '#307b92' : MUTED,
          color: canGenerate ? '#fff' : BG,
          border: 'none', borderRadius: 8,
          padding: '12px 28px', fontSize: 14, fontWeight: 700,
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          marginBottom: 28, opacity: canGenerate ? 1 : 0.5,
          transition: 'all 0.15s',
        }}
      >
        Generate Rotation
      </button>

      {/* ── Result ── */}
      {result && <RotationGrid result={result} players={players} />}
    </div>
  )
}

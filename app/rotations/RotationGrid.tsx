'use client'
// Rotation Grid — Timeline visualisation + substitution sheet
// Dynamic: reads numPeriods, periodDuration, noSubFirst/LastMins from result.config

import { useState } from 'react'
import type { RotationPlayer, PlayerConstraint, OptimiserResult } from './types'

interface Props {
  result: OptimiserResult
  players: RotationPlayer[]
  constraints?: PlayerConstraint[]
}

// ── Palette ───────────────────────────────────────────────────────────────────

const BG      = '#0f1117'
const CARD    = '#171c2a'
const BORDER  = '#2e374d'
const TEAL    = '#97cfdc'
const PRIMARY = '#e8eaf0'
const MUTED   = '#6d7894'
const SEC     = '#a0a8bc'
const AMBER   = '#fbbf24'
const GREEN   = '#34d399'
const RED     = '#f87171'

// Per-player colors (10 distinct hues)
const PLAYER_COLORS = [
  '#97cfdc', // teal
  '#fbbf24', // amber
  '#34d399', // emerald
  '#fb923c', // orange
  '#a78bfa', // violet
  '#60a5fa', // blue
  '#f87171', // red-400
  '#4ade80', // green-400
  '#c084fc', // purple-400
  '#38bdf8', // sky-400
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function playerColor(players: RotationPlayer[], playerId: string): string {
  const idx = players.findIndex(p => p.id === playerId)
  return idx >= 0 ? PLAYER_COLORS[idx % PLAYER_COLORS.length] : '#666'
}

function playerName(players: RotationPlayer[], id: string): string {
  const p = players.find(p => p.id === id)
  return p ? `#${p.jersey} ${p.firstName}` : id
}

function slotOf(plan: OptimiserResult['plan'], q: number, w: number) {
  return plan.find(s => s.quarter === q && s.window === w)
}

// Time label: window 1 = start of period (10:00 for 10-min period)
// window w = (periodDuration - w + 1) minutes remaining
function windowTimeLabel(w: number, periodDuration: number): string {
  const minsRemaining = periodDuration - w + 1
  return `${minsRemaining}:00`
}

function periodLabel(numPeriods: number, period: number): string {
  return numPeriods === 2 ? `HALF ${period}` : `QUARTER ${period}`
}

function periodAbbr(numPeriods: number, period: number): string {
  return numPeriods === 2 ? `H${period}` : `Q${period}`
}

function isLockedWindow(w: number, noSubFirstMins: number, noSubLastMins: number, periodDuration: number): boolean {
  if (w === 1) return false // period start — always free
  const inFirst = w <= noSubFirstMins
  const inLast  = w > periodDuration - noSubLastMins
  return inFirst || inLast
}

// ── Tab button ────────────────────────────────────────────────────────────────

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none',
      borderBottom: active ? `2px solid ${TEAL}` : '2px solid transparent',
      padding: '8px 16px', fontSize: 13, fontWeight: active ? 700 : 500,
      color: active ? TEAL : MUTED, cursor: 'pointer', transition: 'all 0.15s',
    }}>
      {label}
    </button>
  )
}

// ── Timeline view ─────────────────────────────────────────────────────────────

function TimelineView({ result, players }: { result: OptimiserResult; players: RotationPlayer[] }) {
  const { plan, config } = result
  const { numPeriods, periodDuration, noSubFirstMins, noSubLastMins } = config
  const NAME_W = 110

  // Build period array and window array
  const periods  = Array.from({ length: numPeriods },  (_, i) => i + 1)
  const windows  = Array.from({ length: periodDuration }, (_, i) => i + 1)

  // Show window labels every N windows to avoid crowding
  // For 10-min period: show every 2 mins. For ≥12-min: every 3.
  const labelEvery = periodDuration <= 8 ? 2 : periodDuration <= 12 ? 2 : 3

  return (
    <div style={{ overflowX: 'auto' }}>

      {/* Period headers */}
      <div style={{ display: 'flex', marginLeft: NAME_W, marginBottom: 4 }}>
        {periods.map((p, pi) => (
          <div key={p} style={{
            flex: 1, textAlign: 'center',
            fontSize: 11, fontWeight: 700, color: TEAL, letterSpacing: '0.06em',
            borderLeft: pi > 0 ? `1px solid ${BORDER}` : 'none',
            paddingLeft: pi > 0 ? 4 : 0,
          }}>
            {periodAbbr(numPeriods, p)}
          </div>
        ))}
      </div>

      {/* Window time labels */}
      <div style={{ display: 'flex', marginLeft: NAME_W, marginBottom: 8 }}>
        {periods.map((p, pi) => (
          <div key={p} style={{ flex: 1, display: 'flex', borderLeft: pi > 0 ? `1px solid ${BORDER}` : 'none', paddingLeft: pi > 0 ? 4 : 0 }}>
            {windows.map((w) => {
              const locked = isLockedWindow(w, noSubFirstMins, noSubLastMins, periodDuration)
              const showLabel = (w === 1) || (w % labelEvery === 0) || (w === periodDuration)
              return (
                <div key={w} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: locked ? '#44526a' : MUTED }}>
                  {showLabel ? windowTimeLabel(w, periodDuration) : ''}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Player rows */}
      {players.map((p, idx) => {
        const color = PLAYER_COLORS[idx % PLAYER_COLORS.length]
        const hasAnySlot = plan.some(s => s.playerIds.includes(p.id))
        if (!hasAnySlot) return null

        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            {/* Name column */}
            <div style={{ width: NAME_W, flexShrink: 0, fontSize: 11, color: SEC, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 5 }} />
              #{p.jersey} {p.firstName}
            </div>

            {/* Period segments */}
            {periods.map((period, pi) => (
              <div key={period} style={{ flex: 1, display: 'flex', gap: 1, borderLeft: pi > 0 ? `1px solid ${BORDER}` : 'none', paddingLeft: pi > 0 ? 4 : 0 }}>
                {windows.map(w => {
                  const slot    = slotOf(plan, period, w)
                  const onCourt = slot?.playerIds.includes(p.id) ?? false
                  const locked  = isLockedWindow(w, noSubFirstMins, noSubLastMins, periodDuration)

                  // Sub-in: on court now, wasn't in previous slot within same period
                  const prevSlot = w > 1 ? slotOf(plan, period, w - 1) : null
                  const isSubIn  = onCourt && prevSlot != null && !prevSlot.playerIds.includes(p.id)
                  const isSubOut = !onCourt && prevSlot != null && prevSlot.playerIds.includes(p.id)

                  return (
                    <div key={w} style={{ flex: 1, position: 'relative', minWidth: 4 }}>
                      <div style={{
                        height: 24,
                        background: onCourt
                          ? (locked ? color + 'bb' : color)
                          : locked
                            ? 'rgba(255,255,255,0.015)'
                            : 'rgba(255,255,255,0.04)',
                        borderRadius: 3,
                        border: onCourt
                          ? `1px solid ${color}`
                          : `1px solid ${locked ? '#1e2535' : BORDER}`,
                        opacity: onCourt ? 1 : 0.3,
                        boxShadow: isSubIn ? `inset 3px 0 0 rgba(255,255,255,0.8)` : 'none',
                        // Locked zone: subtle diagonal stripe overlay
                        backgroundImage: !onCourt && locked
                          ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.015) 3px, rgba(255,255,255,0.015) 6px)'
                          : 'none',
                        transition: 'opacity 0.1s',
                      }} />
                      {/* Sub call marker */}
                      {(isSubIn || isSubOut) && !locked && (
                        <div style={{
                          position: 'absolute', top: -4, left: 0,
                          width: 2, height: 32, background: AMBER, borderRadius: 1,
                          opacity: 0.8,
                        }} />
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )
      })}

      {/* No-sub zone legend */}
      {(noSubFirstMins > 0 || noSubLastMins > 0) && (
        <div style={{ marginTop: 10, fontSize: 10, color: MUTED }}>
          <span style={{
            display: 'inline-block', width: 12, height: 8, borderRadius: 2,
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.08) 3px, rgba(255,255,255,0.08) 6px)',
            border: `1px solid #1e2535`, marginRight: 6, verticalAlign: 'middle',
          }} />
          No-sub zone
          {noSubFirstMins > 0 && ` (first ${noSubFirstMins} min)`}
          {noSubLastMins  > 0 && ` (last ${noSubLastMins} min)`}
          {' · '}
          <span><span style={{ display: 'inline-block', width: 2, height: 10, background: AMBER, borderRadius: 1, marginRight: 4, verticalAlign: 'middle' }} />Sub call</span>
          {' · '}
          <span><span style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, background: TEAL, marginRight: 4, verticalAlign: 'middle' }} />On court</span>
        </div>
      )}
    </div>
  )
}

// ── Playing time view ─────────────────────────────────────────────────────────

function MinutesView({ result, players }: { result: OptimiserResult; players: RotationPlayer[] }) {
  const totalGameMins = result.config.numPeriods * result.config.periodDuration

  return (
    <div>
      {players.map((p, idx) => {
        const report = result.constraintReport.find(r => r.playerId === p.id)
        const mins   = report?.minutesAssigned ?? 0
        if (mins === 0) return null
        const color  = PLAYER_COLORS[idx % PLAYER_COLORS.length]
        const pct    = Math.min(100, (mins / totalGameMins) * 100)

        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 100, fontSize: 12, color: SEC, textAlign: 'right', flexShrink: 0 }}>
              #{p.jersey} {p.firstName}
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 28, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: color, borderRadius: 3,
                display: 'flex', alignItems: 'center', paddingLeft: 8,
                minWidth: 40,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#0f1117' }}>
                  {mins} min
                </span>
              </div>
            </div>
            {!report?.minMinutesMet && (
              <span style={{ fontSize: 10, color: RED, flexShrink: 0 }}>↓ min</span>
            )}
            {!report?.everyQuarterMet && (
              <span style={{ fontSize: 10, color: AMBER, flexShrink: 0 }}>
                not every {result.config.numPeriods === 2 ? 'half' : 'Q'}
              </span>
            )}
          </div>
        )
      })}
      <div style={{ marginTop: 8, fontSize: 10, color: MUTED }}>
        Total game time: {totalGameMins} min · {result.config.numPeriods} {result.config.numPeriods === 2 ? 'halves' : 'quarters'} of {result.config.periodDuration} min
      </div>
    </div>
  )
}

// ── Sub sheet view ────────────────────────────────────────────────────────────

function SubSheetView({ result, players }: { result: OptimiserResult; players: RotationPlayer[] }) {
  const { plan, config } = result
  const { numPeriods, periodDuration, noSubFirstMins, noSubLastMins } = config
  const periods = Array.from({ length: numPeriods }, (_, i) => i + 1)

  return (
    <div>
      {periods.map(period => {
        const pSlots = plan
          .filter(s => s.quarter === period)
          .sort((a, b) => a.window - b.window)

        if (pSlots.length === 0) return null

        return (
          <div key={period} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEAL, marginBottom: 10, letterSpacing: '0.05em' }}>
              {periodLabel(numPeriods, period).toUpperCase()}
            </div>

            {/* Starting lineup */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, width: 50, flexShrink: 0 }}>START</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(pSlots[0]?.playerIds ?? []).map(id => (
                  <span key={id} style={{
                    background: playerColor(players, id) + '22',
                    border: `1px solid ${playerColor(players, id)}44`,
                    color: playerColor(players, id),
                    borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  }}>
                    {playerName(players, id)}
                  </span>
                ))}
              </div>
            </div>

            {/* Sub events — only at windows where lineup actually changed AND not locked */}
            {pSlots.slice(1).map((slot, wi) => {
              const prev    = pSlots[wi]
              const prevSet = new Set(prev.playerIds)
              const currSet = new Set(slot.playerIds)
              const subOut  = prev.playerIds.filter(id => !currSet.has(id))
              const subIn   = slot.playerIds.filter(id => !prevSet.has(id))
              if (subOut.length === 0) return null

              const locked    = isLockedWindow(slot.window, noSubFirstMins, noSubLastMins, periodDuration)
              const timeStamp = windowTimeLabel(slot.window, periodDuration)

              return (
                <div key={slot.window} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, paddingLeft: 4, opacity: locked ? 0.4 : 1 }}>
                  <span style={{ fontSize: 12, color: locked ? MUTED : AMBER, fontWeight: 700, width: 50, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {timeStamp}
                  </span>
                  <div style={{ fontSize: 12, color: SEC, lineHeight: 1.6 }}>
                    {subIn.map((id, i) => (
                      <span key={id}>
                        <span style={{ color: GREEN, fontWeight: 600 }}>{playerName(players, id)}</span>
                        {' in for '}
                        <span style={{ color: RED }}>{playerName(players, subOut[i] ?? subOut[0])}</span>
                        {i < subIn.length - 1 ? ' · ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RotationGrid({ result, players }: Props) {
  const [tab, setTab] = useState<'timeline' | 'minutes' | 'sheet'>('timeline')
  const { config, subCallsPerQuarter, totalSubCalls } = result
  const { numPeriods } = config

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
        padding: '12px 16px', background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 10, marginBottom: 16,
      }}>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: MUTED }}>Sub calls: </span>
          <span style={{ color: PRIMARY, fontWeight: 600 }}>
            {subCallsPerQuarter.map((n, i) => `${periodAbbr(numPeriods, i + 1)}: ${n}`).join('  ·  ')}
          </span>
          <span style={{ color: TEAL, fontWeight: 700, marginLeft: 10 }}>
            = {totalSubCalls} total
          </span>
        </div>
        {result.feasible ? (
          <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>✓ All constraints met</span>
        ) : (
          <span style={{ fontSize: 11, color: AMBER, fontWeight: 600 }}>⚠ Some constraints unmet</span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, marginBottom: 20 }}>
        <Tab label="Timeline"     active={tab === 'timeline'} onClick={() => setTab('timeline')} />
        <Tab label="Playing Time" active={tab === 'minutes'}  onClick={() => setTab('minutes')}  />
        <Tab label="Sub Sheet"    active={tab === 'sheet'}    onClick={() => setTab('sheet')}    />
      </div>

      {/* Tab content */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, overflowX: 'auto' }}>
        {tab === 'timeline' && <TimelineView result={result} players={players} />}
        {tab === 'minutes'  && <MinutesView  result={result} players={players} />}
        {tab === 'sheet'    && <SubSheetView result={result} players={players} />}
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(251,191,36,0.06)', border: `1px solid rgba(251,191,36,0.25)`, borderRadius: 8 }}>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: AMBER, marginBottom: i < result.warnings.length - 1 ? 4 : 0 }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

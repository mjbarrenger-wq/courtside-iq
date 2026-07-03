'use client'

import { useState } from 'react'

export type PlayerBubble = {
  name: string
  firstName: string
  jersey: number
  off_ppp: number
  def_ppp: number
  mpg: number
  games: number
}

const PLAYER_COLORS: Record<string, string> = {
  'Zach Schulze':     '#60a5fa',
  'Raph Liu':         '#818cf8',
  'Wade Porto':       '#f87171',
  'Cooper Barrenger': '#fbbf24',
  'Teddy Young':      '#06b6d4',
  'Charlie Pallson':  '#ca8a04',
  'Zac Nikolovski':   '#f97316',
  'Lenny Simmons':    '#a0a8bc',
  'Mitchell Pearson': '#34d399',
  'Ethan Broadbent':  '#84cc16',
}

function formatMpg(mpg: number) {
  const mins = Math.floor(mpg)
  const secs = Math.round((mpg - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')} MPG`
}

export default function BubbleChart({ players }: { players: PlayerBubble[] }) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (!players.length) return null

  // ── Layout ────────────────────────────────────────────────────────────────────
  const W = 860
  const H = 580
  const PAD = { top: 50, right: 40, bottom: 70, left: 70 }
  const CW = W - PAD.left - PAD.right
  const CH = H - PAD.top - PAD.bottom

  // ── Scales ────────────────────────────────────────────────────────────────────
  const offValues = players.map(p => p.off_ppp)
  const defValues = players.map(p => p.def_ppp)
  const mpgValues = players.map(p => p.mpg)

  const offMin = Math.min(...offValues) - 0.02
  const offMax = Math.max(...offValues) + 0.02
  const defMin = Math.min(...defValues) - 0.01
  const defMax = Math.max(...defValues) + 0.01
  const mpgMin = Math.min(...mpgValues)
  const mpgMax = Math.max(...mpgValues)

  // Minutes-weighted team average — total minutes played weights each player's contribution.
  // Simple mean is wrong because a 2-game sample skews the crosshairs as much as a 10-game sample.
  const totalMins = players.reduce((s, p) => s + p.mpg * p.games, 0)
  const teamAvgOff = totalMins > 0
    ? players.reduce((s, p) => s + p.off_ppp * (p.mpg * p.games), 0) / totalMins
    : players.reduce((s, p) => s + p.off_ppp, 0) / players.length
  const teamAvgDef = totalMins > 0
    ? players.reduce((s, p) => s + p.def_ppp * (p.mpg * p.games), 0) / totalMins
    : players.reduce((s, p) => s + p.def_ppp, 0) / players.length

  // X: def_ppp reversed — lower (better) to the right
  const xScale = (def: number) =>
    PAD.left + ((defMax - def) / (defMax - defMin)) * CW

  // Y: off_ppp — higher (better) upward
  const yScale = (off: number) =>
    PAD.top + CH - ((off - offMin) / (offMax - offMin)) * CH

  // Bubble radius: 16–36px range
  const rScale = (mpg: number) =>
    mpgMax === mpgMin ? 26 : 16 + ((mpg - mpgMin) / (mpgMax - mpgMin)) * 20

  const avgX = xScale(teamAvgDef)
  const avgY = yScale(teamAvgOff)

  // ── Axis ticks ────────────────────────────────────────────────────────────────
  const offTicks = Array.from({ length: 5 }, (_, i) =>
    parseFloat((offMin + (i / 4) * (offMax - offMin)).toFixed(3))
  )
  const defTicks = Array.from({ length: 5 }, (_, i) =>
    parseFloat((defMin + (i / 4) * (defMax - defMin)).toFixed(3))
  )

  // ── Smart label offsets ───────────────────────────────────────────────────────
  // Pre-compute positions to nudge labels away from bubbles
  const labelOffset = (p: PlayerBubble): { dx: number; dy: number } => {
    const r = rScale(p.mpg)
    const x = xScale(p.def_ppp)
    const y = yScale(p.off_ppp)
    // Default: right of bubble
    let dx = r + 6
    let dy = -10
    // Near right edge — flip left
    if (x + r + 110 > W - PAD.right) { dx = -(r + 6); }
    // Near top — push down
    if (y - 20 < PAD.top) { dy = r + 14 }
    return { dx, dy }
  }

  // ── Colours ───────────────────────────────────────────────────────────────────
  const color = (p: PlayerBubble) => PLAYER_COLORS[p.name] ?? '#6d7894'

  const CARD_BG    = '#f8f9fb'
  const GRID_LINE  = '#e2e5eb'
  const TEXT_DIM   = '#6b7280'
  const TEXT_MED   = '#374151'
  const TEXT_LIGHT = '#1a1f2e'
  const AVG_LINE   = '#307b92'

  return (
    <div style={{ width: '100%', maxWidth: W, margin: '0 auto', position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', userSelect: 'none' }}
      >
        {/* Chart area */}
        <rect
          x={PAD.left} y={PAD.top}
          width={CW} height={CH}
          fill={CARD_BG} rx={6}
        />

        {/* Subtle grid lines */}
        {offTicks.map(v => (
          <line key={`og-${v}`}
            x1={PAD.left} x2={PAD.left + CW}
            y1={yScale(v)} y2={yScale(v)}
            stroke={GRID_LINE} strokeWidth={1} />
        ))}
        {defTicks.map(v => (
          <line key={`dg-${v}`}
            x1={xScale(v)} x2={xScale(v)}
            y1={PAD.top} y2={PAD.top + CH}
            stroke={GRID_LINE} strokeWidth={1} />
        ))}

        {/* ── Team average crosshairs ── */}
        <line x1={avgX} y1={PAD.top} x2={avgX} y2={PAD.top + CH}
          stroke={AVG_LINE} strokeWidth={1.5} strokeDasharray="5,4" opacity={0.75} />
        <line x1={PAD.left} y1={avgY} x2={PAD.left + CW} y2={avgY}
          stroke={AVG_LINE} strokeWidth={1.5} strokeDasharray="5,4" opacity={0.75} />

        {/* Team avg marker */}
        <g>
          <circle cx={avgX} cy={avgY} r={5} fill={AVG_LINE} opacity={0.9} />
          <rect x={avgX + 8} y={avgY - 10} width={78} height={18} rx={3} fill="#eef1f6" />
          <text x={avgX + 47} y={avgY + 3} textAnchor="middle"
            fontSize={10} fontWeight={700} fill={AVG_LINE}>TEAM AVG</text>
        </g>

        {/* ── Quadrant labels ── */}
        {[
          { id: 'q1', label: ['Weaker Defence', 'Strong Offence'],   x: PAD.left + 10,      y: PAD.top + 10      },
          { id: 'q2', label: ['Strong Defence', 'Strong Offence'],   x: avgX + 10,          y: PAD.top + 10      },
          { id: 'q3', label: ['Weaker Defence', 'Lower Offence'],    x: PAD.left + 10,      y: avgY + 14         },
          { id: 'q4', label: ['Strong Defence', 'Lower Offence'],    x: avgX + 10,          y: avgY + 14         },
        ].map(({ id, label, x, y }) => (
          <g key={id}>
            <text x={x + 4} y={y + 13} fontSize={11} fontWeight={700} fill={TEXT_DIM}>{label[0]}</text>
            <text x={x + 4} y={y + 26} fontSize={11} fontWeight={700} fill={TEXT_DIM}>{label[1]}</text>
          </g>
        ))}

        {/* ── Bubbles ── */}
        {players.map((p) => {
          const x = xScale(p.def_ppp)
          const y = yScale(p.off_ppp)
          const r = rScale(p.mpg)
          const c = color(p)
          const isHov = hovered === p.name
          const isDim = hovered !== null && !isHov
          const { dx, dy } = labelOffset(p)

          return (
            <g key={p.name}
              onMouseEnter={() => setHovered(p.name)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={x} cy={y} r={r}
                fill={c}
                opacity={isDim ? 0.12 : isHov ? 0.9 : 0.75}
                stroke={isHov ? '#ffffff' : c}
                strokeWidth={isHov ? 2 : 0}
                style={{ transition: 'opacity 0.15s' }}
              />
              <text
                x={x + dx}
                y={y + dy}
                fontSize={11}
                fontWeight={isHov ? 700 : 500}
                fill={isDim ? TEXT_DIM : TEXT_LIGHT}
                style={{ transition: 'fill 0.15s' }}
              >
                {p.name}
              </text>
              <text
                x={x + dx}
                y={y + dy + 13}
                fontSize={10}
                fill={isDim ? TEXT_DIM : TEXT_MED}
                style={{ transition: 'fill 0.15s' }}
              >
                {formatMpg(p.mpg)}
              </text>
            </g>
          )
        })}

        {/* ── Y axis ── */}
        <text
          x={18} y={PAD.top + CH / 2}
          fontSize={11} fill={TEXT_MED} textAnchor="middle"
          transform={`rotate(-90, 18, ${PAD.top + CH / 2})`}
        >
          Offensive PPP  |  Higher is better
        </text>
        {offTicks.map(v => (
          <g key={`ot-${v}`}>
            <line x1={PAD.left - 4} x2={PAD.left} y1={yScale(v)} y2={yScale(v)} stroke={TEXT_DIM} />
            <text x={PAD.left - 7} y={yScale(v) + 4}
              fontSize={9} fill={TEXT_DIM} textAnchor="end">{v.toFixed(3)}</text>
          </g>
        ))}

        {/* ── X axis ── */}
        <text
          x={PAD.left + CW / 2} y={H - 8}
          fontSize={11} fill={TEXT_MED} textAnchor="middle"
        >
          Defensive PPP  |  To the right is better
        </text>
        {defTicks.map(v => (
          <g key={`dt-${v}`}>
            <line
              x1={xScale(v)} x2={xScale(v)}
              y1={PAD.top + CH} y2={PAD.top + CH + 4}
              stroke={TEXT_DIM}
            />
            <text
              x={xScale(v)} y={PAD.top + CH + 15}
              fontSize={9} fill={TEXT_DIM} textAnchor="middle"
            >
              {v.toFixed(3)}
            </text>
          </g>
        ))}

        {/* ── Chart border ── */}
        <rect
          x={PAD.left} y={PAD.top}
          width={CW} height={CH}
          fill="none"
          stroke={GRID_LINE} strokeWidth={1} rx={6}
        />
      </svg>

      {/* Hover tooltip */}
      {hovered && (() => {
        const p = players.find(pl => pl.name === hovered)
        if (!p) return null
        return (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: '#ffffff',
            border: `1px solid ${PLAYER_COLORS[p.name] ?? '#e2e5eb'}`,
            boxShadow: 'rgba(0,0,0,0.1) 0px 4px 12px',
            borderRadius: 10, padding: '12px 16px',
            minWidth: 180,
            pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_LIGHT, marginBottom: 8 }}>
              #{p.jersey} {p.name}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { label: 'Off PPP',  value: p.off_ppp.toFixed(3) },
                { label: 'Def PPP',  value: p.def_ppp.toFixed(3) },
                { label: 'Net PPP',  value: (p.off_ppp - p.def_ppp >= 0 ? '+' : '') + (p.off_ppp - p.def_ppp).toFixed(3) },
                { label: 'MPG',      value: formatMpg(p.mpg) },
                { label: 'Games',    value: String(p.games) },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ fontSize: 11, color: TEXT_MED }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_LIGHT }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Footer note */}
      <p style={{ textAlign: 'center', fontSize: 11, color: TEXT_DIM, margin: '8px 0 0' }}>
        Higher and further right indicates stronger two-way performance relative to team average.
        Bubble size represents average minutes per game.
      </p>
    </div>
  )
}

'use client'

import { useState } from 'react'

export interface GamePoint {
  index: number
  gameId: string
  date: string
  opponent: string
  result: 'W' | 'L'
  teamScore: number
  oppScore: number
  offPpp: number | null
  defPpp: number | null
  netPpp: number | null
}

interface Props {
  games: GamePoint[]
}

function rollingAvg(values: (number | null)[], n: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < n - 1) return null
    const slice = values.slice(i - n + 1, i + 1)
    const valid = slice.filter((v): v is number => v != null)
    if (valid.length < n) return null
    return valid.reduce((s, v) => s + v, 0) / n
  })
}

const OFF_COLOR = '#307b92'
const DEF_COLOR = '#e05555'
const NET_COLOR = '#059669'

export function TrendChart({ games }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [showOff, setShowOff]         = useState(true)
  const [showDef, setShowDef]         = useState(true)
  const [showNet, setShowNet]         = useState(true)
  const [showRolling, setShowRolling] = useState(true)

  const W = 1000
  const H = 380
  const PAD = { top: 28, right: 20, bottom: 72, left: 52 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const n = games.length
  if (n === 0) return <div style={{ color: '#6b7280', padding: 24 }}>No game data available.</div>

  const offValues = games.map(g => g.offPpp)
  const defValues = games.map(g => g.defPpp)
  const netValues = games.map(g => g.netPpp)

  const allValues = [...offValues, ...defValues, ...netValues]
    .filter((v): v is number => v != null)

  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const yMin = Math.floor((rawMin - 0.05) * 10) / 10
  const yMax = Math.ceil((rawMax  + 0.05) * 10) / 10

  const xPos = (i: number) =>
    n === 1 ? PAD.left + chartW / 2 : PAD.left + (i / (n - 1)) * chartW
  const yPos = (v: number) =>
    PAD.top + (1 - (v - yMin) / (yMax - yMin)) * chartH

  function buildPath(values: (number | null)[]): string {
    let d = ''
    for (let i = 0; i < values.length; i++) {
      const v = values[i]
      if (v == null) continue
      const x = xPos(i)
      const y = yPos(v)
      d += d === '' ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`
    }
    return d
  }

  const offRolling = rollingAvg(offValues, 3)
  const defRolling = rollingAvg(defValues, 3)
  const netRolling = rollingAvg(netValues, 3)

  // Y-axis ticks at 0.1 intervals
  const yTicks: number[] = []
  for (let v = Math.ceil(yMin * 10) / 10; v <= yMax + 0.001; v = Math.round((v + 0.2) * 100) / 100) {
    yTicks.push(parseFloat(v.toFixed(2)))
  }

  const zeroY = yPos(0)
  const stripeW = n > 1 ? chartW / n : chartW

  const hg = hovered != null ? games[hovered] : null

  const toggles = [
    { label: 'Off PPP', color: OFF_COLOR, active: showOff, set: setShowOff },
    { label: 'Def PPP', color: DEF_COLOR, active: showDef, set: setShowDef },
    { label: 'Net PPP', color: NET_COLOR, active: showNet, set: setShowNet },
    { label: '3-Game Avg', color: '#6b7280', active: showRolling, set: setShowRolling },
  ]

  return (
    <div>
      {/* Legend / toggles */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {toggles.map(({ label, color, active, set }) => (
          <button
            key={label}
            onClick={() => set(v => !v)}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', border: `1px solid ${active ? color : '#e2e5eb'}`,
              background: active ? color + '18' : '#f4f5f7',
              color: active ? color : '#9ca3af',
            }}
          >
            {label === '3-Game Avg'
              ? <span>— — {label}</span>
              : <span>— {label}</span>}
          </button>
        ))}
      </div>

      {/* Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>

        {/* W/L background stripes */}
        {games.map((g, i) => (
          <rect
            key={`bg-${i}`}
            x={PAD.left + i * stripeW}
            y={PAD.top}
            width={stripeW}
            height={chartH}
            fill={g.result === 'W' ? '#059669' : '#dc2626'}
            opacity={0.04}
          />
        ))}

        {/* Gridlines */}
        {yTicks.map(v => {
          const y = yPos(v)
          return (
            <g key={`grid-${v}`}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                stroke="#e2e5eb" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                fontSize={10} fill="#6b7280">{v.toFixed(2)}</text>
            </g>
          )
        })}

        {/* Zero line (Net PPP reference) */}
        {zeroY >= PAD.top && zeroY <= PAD.top + chartH && (
          <line x1={PAD.left} y1={zeroY} x2={PAD.left + chartW} y2={zeroY}
            stroke="#374151" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.35} />
        )}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH}
          stroke="#e2e5eb" strokeWidth={1} />
        <line x1={PAD.left} y1={PAD.top + chartH} x2={PAD.left + chartW} y2={PAD.top + chartH}
          stroke="#e2e5eb" strokeWidth={1} />

        {/* X-axis labels */}
        {games.map((g, i) => {
          const showLabel = n <= 12 || i === 0 || (i + 1) % 5 === 0 || i === n - 1
          if (!showLabel) return null
          const x = xPos(i)
          return (
            <g key={`xlabel-${i}`}>
              <line x1={x} y1={PAD.top + chartH} x2={x} y2={PAD.top + chartH + 4}
                stroke="#d1d5db" strokeWidth={1} />
              <text x={x} y={PAD.top + chartH + 16} textAnchor="middle"
                fontSize={9} fill="#6b7280">{`G${i + 1}`}</text>
            </g>
          )
        })}

        {/* W/L result dots below x-axis */}
        {games.map((g, i) => (
          <circle
            key={`wl-${i}`}
            cx={xPos(i)}
            cy={PAD.top + chartH + 32}
            r={4}
            fill={g.result === 'W' ? '#059669' : '#dc2626'}
            opacity={hovered === i ? 1 : 0.7}
          />
        ))}

        {/* Per-game lines */}
        {showOff && (
          <path d={buildPath(offValues)} fill="none" stroke={OFF_COLOR}
            strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
        )}
        {showDef && (
          <path d={buildPath(defValues)} fill="none" stroke={DEF_COLOR}
            strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
        )}
        {showNet && (
          <path d={buildPath(netValues)} fill="none" stroke={NET_COLOR}
            strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
        )}

        {/* Rolling average lines (dashed, thicker) */}
        {showOff && showRolling && (
          <path d={buildPath(offRolling)} fill="none" stroke={OFF_COLOR}
            strokeWidth={2.5} strokeDasharray="7 3" strokeLinejoin="round" opacity={0.95} />
        )}
        {showDef && showRolling && (
          <path d={buildPath(defRolling)} fill="none" stroke={DEF_COLOR}
            strokeWidth={2.5} strokeDasharray="7 3" strokeLinejoin="round" opacity={0.95} />
        )}
        {showNet && showRolling && (
          <path d={buildPath(netRolling)} fill="none" stroke={NET_COLOR}
            strokeWidth={2.5} strokeDasharray="7 3" strokeLinejoin="round" opacity={0.95} />
        )}

        {/* Hover vertical line */}
        {hovered != null && (
          <line
            x1={xPos(hovered)} y1={PAD.top}
            x2={xPos(hovered)} y2={PAD.top + chartH}
            stroke="#374151" strokeWidth={1} strokeDasharray="3 2" opacity={0.4}
          />
        )}

        {/* Dots — rendered above lines */}
        {games.map((g, i) => {
          const isH = hovered === i
          const r = isH ? 5 : 3
          return (
            <g key={`dots-${i}`}>
              {showOff && g.offPpp != null && (
                <circle cx={xPos(i)} cy={yPos(g.offPpp)} r={r}
                  fill={OFF_COLOR} stroke="#fff" strokeWidth={isH ? 2 : 1.5} />
              )}
              {showDef && g.defPpp != null && (
                <circle cx={xPos(i)} cy={yPos(g.defPpp)} r={r}
                  fill={DEF_COLOR} stroke="#fff" strokeWidth={isH ? 2 : 1.5} />
              )}
              {showNet && g.netPpp != null && (
                <circle cx={xPos(i)} cy={yPos(g.netPpp)} r={r}
                  fill={NET_COLOR} stroke="#fff" strokeWidth={isH ? 2 : 1.5} />
              )}
            </g>
          )
        })}

        {/* Hover areas (invisible columns) */}
        {games.map((g, i) => (
          <rect
            key={`hover-${i}`}
            x={PAD.left + i * stripeW}
            y={PAD.top}
            width={stripeW}
            height={chartH + 40}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        {/* Tooltip */}
        {hovered != null && hg && (() => {
          const x = xPos(hovered)
          const TW = 162, TH = 110
          const rawTX = x - TW / 2
          const tipX = Math.max(PAD.left, Math.min(rawTX, PAD.left + chartW - TW))
          const tipY = PAD.top + 6
          const fmt = (v: number | null) => v != null ? v.toFixed(2) : '—'
          const dateStr = new Date(hg.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={tipX} y={tipY} width={TW} height={TH} rx={6}
                fill="#ffffff" stroke="#e2e5eb" strokeWidth={1}
                style={{ filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.10))' }} />
              <text x={tipX + 10} y={tipY + 16} fontSize={11} fontWeight={700}
                fill={hg.result === 'W' ? '#059669' : '#dc2626'}>
                {hg.result} · {hg.teamScore}–{hg.oppScore}
              </text>
              <text x={tipX + 10} y={tipY + 31} fontSize={10} fill="#374151">
                vs {hg.opponent.length > 18 ? hg.opponent.slice(0, 18) + '…' : hg.opponent}
              </text>
              <text x={tipX + 10} y={tipY + 44} fontSize={9} fill="#9ca3af">{dateStr} · G{hovered + 1}</text>
              <line x1={tipX + 8} y1={tipY + 52} x2={tipX + TW - 8} y2={tipY + 52}
                stroke="#f0f2f7" strokeWidth={1} />
              <circle cx={tipX + 17} cy={tipY + 65} r={4} fill={OFF_COLOR} />
              <text x={tipX + 27} y={tipY + 69} fontSize={10} fill="#374151">
                Off  <tspan fontWeight={700} fill={OFF_COLOR}>{fmt(hg.offPpp)}</tspan>
              </text>
              <circle cx={tipX + 17} cy={tipY + 82} r={4} fill={DEF_COLOR} />
              <text x={tipX + 27} y={tipY + 86} fontSize={10} fill="#374151">
                Def  <tspan fontWeight={700} fill={DEF_COLOR}>{fmt(hg.defPpp)}</tspan>
              </text>
              <circle cx={tipX + 17} cy={tipY + 99} r={4} fill={NET_COLOR} />
              <text x={tipX + 27} y={tipY + 103} fontSize={10} fill="#374151">
                Net  <tspan fontWeight={700} fill={hg.netPpp != null && hg.netPpp >= 0 ? NET_COLOR : '#dc2626'}>
                  {hg.netPpp != null ? (hg.netPpp >= 0 ? '+' : '') + hg.netPpp.toFixed(2) : '—'}
                </tspan>
              </text>
            </g>
          )
        })()}
      </svg>

      {/* X-axis footnote */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 10, color: '#9ca3af' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width={10} height={10}><circle cx={5} cy={5} r={4} fill="#059669" /></svg> Win
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width={10} height={10}><circle cx={5} cy={5} r={4} fill="#dc2626" /></svg> Loss
        </span>
        <span style={{ marginLeft: 8 }}>Dots below chart show result per game · dashed lines = 3-game rolling average</span>
      </div>
    </div>
  )
}

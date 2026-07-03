'use client'

import { useState } from 'react'
import { getStatCategory, type StatKey } from './statCategories'

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
  ppg: number | null
  toPct: number | null
  efg: number | null
  reb: number | null
  ast: number | null
  stl: number | null
  blk: number | null
  ftPct: number | null
}

interface Props {
  games: GamePoint[]
  category: StatKey
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

// "Nice numbers" axis step so any stat (PPP decimals, percentages, per-game
// counts) gets a sensible tick interval instead of one step size tuned for PPP.
function niceStep(range: number): number {
  if (range <= 0) return 1
  const rough = range / 5
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const residual = rough / magnitude
  const niceResidual = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1
  return niceResidual * magnitude
}

function formatTick(v: number, format: 'ppp' | 'pct' | 'num', step: number): string {
  if (format === 'pct') return `${v.toFixed(step < 1 ? 1 : 0)}%`
  const decimals = step < 0.05 ? 3 : step < 1 ? 2 : step < 10 ? 1 : 0
  return v.toFixed(decimals)
}

function formatValue(v: number | null, format: 'ppp' | 'pct' | 'num'): string {
  if (v == null) return '—'
  if (format === 'pct') return `${v.toFixed(1)}%`
  return v.toFixed(v < 10 ? 2 : 1)
}

const OFF_COLOR = '#307b92'
const DEF_COLOR = '#e05555'
const NET_COLOR = '#059669'

export function TrendChart({ games, category }: Props) {
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
  if (n === 0) {
    return (
      <div style={{ color: '#6b7280', padding: 24 }}>
        No games match the current filters — try a different Type or View filter.
      </div>
    )
  }

  const isPpp = category === 'ppp'
  const cat = getStatCategory(category)

  // ── Series to plot ──────────────────────────────────────────────────────────
  // 'ppp' mode = the original 3 independently-toggleable Off/Def/Net lines.
  // Any other category = a single line for that stat (still with a rolling-avg toggle).
  const seriesDefs = isPpp
    ? [
        { key: 'off', label: 'Off PPP', color: OFF_COLOR, values: games.map(g => g.offPpp), visible: showOff, toggle: () => setShowOff(v => !v) },
        { key: 'def', label: 'Def PPP', color: DEF_COLOR, values: games.map(g => g.defPpp), visible: showDef, toggle: () => setShowDef(v => !v) },
        { key: 'net', label: 'Net PPP', color: NET_COLOR, values: games.map(g => g.netPpp), visible: showNet, toggle: () => setShowNet(v => !v) },
      ]
    : [
        { key: category, label: cat.label, color: cat.color, values: games.map(g => g[category] as number | null), visible: true, toggle: () => {} },
      ]

  const allValues = seriesDefs.flatMap(s => s.values).filter((v): v is number => v != null)

  if (allValues.length === 0) {
    return (
      <div style={{ color: '#6b7280', padding: 24 }}>
        No {cat.label} data available for these games.
      </div>
    )
  }

  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const pad = Math.max((rawMax - rawMin) * 0.1, isPpp ? 0.05 : cat.format === 'pct' ? 2 : 1)
  const yMin = rawMin - pad
  const yMax = rawMax + pad

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

  const rollingByKey: Record<string, (number | null)[]> = {}
  for (const s of seriesDefs) rollingByKey[s.key] = rollingAvg(s.values, 3)

  const step = niceStep(yMax - yMin)
  const yTicks: number[] = []
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + step * 0.001; v += step) {
    yTicks.push(Math.round(v * 1000) / 1000)
  }

  const zeroY = yPos(0)
  const showZeroLine = isPpp && zeroY >= PAD.top && zeroY <= PAD.top + chartH
  const stripeW = n > 1 ? chartW / n : chartW

  const hg = hovered != null ? games[hovered] : null

  return (
    <div>
      {/* Legend / toggles */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {seriesDefs.map(s => (
          <button
            key={s.key}
            onClick={s.toggle}
            disabled={seriesDefs.length === 1}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              cursor: seriesDefs.length === 1 ? 'default' : 'pointer',
              border: `1px solid ${s.visible ? s.color : '#e2e5eb'}`,
              background: s.visible ? s.color + '18' : '#f4f5f7',
              color: s.visible ? s.color : '#9ca3af',
            }}
          >
            — {s.label}
          </button>
        ))}
        <button
          onClick={() => setShowRolling(v => !v)}
          style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', border: `1px solid ${showRolling ? '#6b7280' : '#e2e5eb'}`,
            background: showRolling ? '#6b728018' : '#f4f5f7',
            color: showRolling ? '#6b7280' : '#9ca3af',
          }}
        >
          — — 3-Game Avg
        </button>
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
                fontSize={10} fill="#6b7280">{formatTick(v, cat.format, step)}</text>
            </g>
          )
        })}

        {/* Zero line (Net PPP reference — only meaningful in PPP mode) */}
        {showZeroLine && (
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
        {seriesDefs.map(s => s.visible && (
          <path key={`line-${s.key}`} d={buildPath(s.values)} fill="none" stroke={s.color}
            strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
        ))}

        {/* Rolling average lines (dashed, thicker) */}
        {showRolling && seriesDefs.map(s => s.visible && (
          <path key={`roll-${s.key}`} d={buildPath(rollingByKey[s.key])} fill="none" stroke={s.color}
            strokeWidth={2.5} strokeDasharray="7 3" strokeLinejoin="round" opacity={0.95} />
        ))}

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
              {seriesDefs.map(s => s.visible && s.values[i] != null && (
                <circle key={`dot-${s.key}-${i}`} cx={xPos(i)} cy={yPos(s.values[i] as number)} r={r}
                  fill={s.color} stroke="#fff" strokeWidth={isH ? 2 : 1.5} />
              ))}
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
          const TW = 162
          const TH = isPpp ? 110 : 78
          const rawTX = x - TW / 2
          const tipX = Math.max(PAD.left, Math.min(rawTX, PAD.left + chartW - TW))
          const tipY = PAD.top + 6
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
              {isPpp ? (
                <>
                  <circle cx={tipX + 17} cy={tipY + 65} r={4} fill={OFF_COLOR} />
                  <text x={tipX + 27} y={tipY + 69} fontSize={10} fill="#374151">
                    Off  <tspan fontWeight={700} fill={OFF_COLOR}>{formatValue(hg.offPpp, 'num')}</tspan>
                  </text>
                  <circle cx={tipX + 17} cy={tipY + 82} r={4} fill={DEF_COLOR} />
                  <text x={tipX + 27} y={tipY + 86} fontSize={10} fill="#374151">
                    Def  <tspan fontWeight={700} fill={DEF_COLOR}>{formatValue(hg.defPpp, 'num')}</tspan>
                  </text>
                  <circle cx={tipX + 17} cy={tipY + 99} r={4} fill={NET_COLOR} />
                  <text x={tipX + 27} y={tipY + 103} fontSize={10} fill="#374151">
                    Net  <tspan fontWeight={700} fill={hg.netPpp != null && hg.netPpp >= 0 ? NET_COLOR : '#dc2626'}>
                      {hg.netPpp != null ? (hg.netPpp >= 0 ? '+' : '') + hg.netPpp.toFixed(2) : '—'}
                    </tspan>
                  </text>
                </>
              ) : (
                <>
                  <circle cx={tipX + 17} cy={tipY + 65} r={4} fill={cat.color} />
                  <text x={tipX + 27} y={tipY + 69} fontSize={10} fill="#374151">
                    {cat.shortLabel}  <tspan fontWeight={700} fill={cat.color}>
                      {formatValue(hg[category] as number | null, cat.format)}
                    </tspan>
                  </text>
                </>
              )}
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

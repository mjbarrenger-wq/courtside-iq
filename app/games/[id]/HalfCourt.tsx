'use client'

import { useRef } from 'react'

// Normalized shot: x 0..1 left→right, y 0..1 baseline(hoop)→half-court.
export interface Shot { x: number; y: number; made: boolean; pts?: number }

// FIBA half-court, drawn to scale (1 m = 10 units) in a 150 × 140 viewBox:
//   width 15 m, half length 14 m; basket 1.575 m off the baseline; key 4.90 × 5.80 m;
//   FT circle r 1.80 m; 3-pt arc r 6.75 m from the basket with 0.90 m straight corners.
// The hoop end (baseline) is at the TOP; y = 0 is the hoop end, y = 1 is half-court.
const W = 150, H = 140
const BASKET_Y = 15.75            // 1.575 m from baseline
const THREE_R = 67.5              // 6.75 m
const CORNER_X = 9                // 0.90 m from the sideline
// Where the corner line meets the arc: sqrt(THREE_R² − (75−CORNER_X)²) below the basket.
const CORNER_MEET_Y = BASKET_Y + Math.sqrt(THREE_R * THREE_R - (75 - CORNER_X) * (75 - CORNER_X))

export default function HalfCourt({
  shots, onPick, maxHeight,
}: {
  shots?: Shot[]
  onPick?: (x: number, y: number) => void
  maxHeight?: number
}) {
  const ref = useRef<SVGSVGElement>(null)
  const LINE = '#94a3b8'
  const toXY = (x: number, y: number) => ({ cx: x * W, cy: y * H })

  function handleClick(e: React.MouseEvent) {
    if (!onPick || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    onPick(x, y)
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      onClick={handleClick}
      style={{
        width: '100%', maxHeight, display: 'block', background: '#f8fafc',
        borderRadius: 10, cursor: onPick ? 'crosshair' : 'default', touchAction: 'none',
      }}
    >
      {/* court outline (baseline at top, half-court line at bottom) */}
      <rect x="1" y="1" width={W - 2} height={H - 2} fill="none" stroke={LINE} strokeWidth="1" />
      {/* half-court line + centre circle (bottom) */}
      <circle cx="75" cy={H} r="18" fill="none" stroke={LINE} strokeWidth="1" />
      {/* key / paint: 4.90 m wide (x 50.5–99.5) × 5.80 m long (y 0–58) */}
      <rect x="50.5" y="0" width="49" height="58" fill="none" stroke={LINE} strokeWidth="1" />
      {/* free-throw circle, r 1.80 m at the FT line (y = 58) */}
      <circle cx="75" cy="58" r="18" fill="none" stroke={LINE} strokeWidth="1" />
      {/* backboard (1.80 m wide, 1.20 m out) + ring */}
      <line x1="66" y1="12" x2="84" y2="12" stroke={LINE} strokeWidth="1.4" />
      <circle cx="75" cy={BASKET_Y} r="2.25" fill="none" stroke={LINE} strokeWidth="1" />
      {/* 3-point line: 0.90 m straight corners, then the 6.75 m arc (well outside the key) */}
      <path
        d={`M ${CORNER_X} 0 L ${CORNER_X} ${CORNER_MEET_Y} A ${THREE_R} ${THREE_R} 0 0 0 ${W - CORNER_X} ${CORNER_MEET_Y} L ${W - CORNER_X} 0`}
        fill="none" stroke={LINE} strokeWidth="1"
      />

      {/* shots */}
      {shots?.map((s, i) => {
        const { cx, cy } = toXY(s.x, s.y)
        return s.made ? (
          <circle key={i} cx={cx} cy={cy} r="2.6" fill="#059669" fillOpacity="0.85" stroke="#065f46" strokeWidth="0.5" />
        ) : (
          <g key={i} stroke="#dc2626" strokeWidth="1.1" strokeLinecap="round">
            <line x1={cx - 2.4} y1={cy - 2.4} x2={cx + 2.4} y2={cy + 2.4} />
            <line x1={cx - 2.4} y1={cy + 2.4} x2={cx + 2.4} y2={cy - 2.4} />
          </g>
        )
      })}
    </svg>
  )
}

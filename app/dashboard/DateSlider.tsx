'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export interface SliderGame { id: string; label: string }

export function DateSlider({ games }: { games: SliderGame[] }) {
  const n = games.length - 1
  const [start, setStart] = useState(0)
  const [end, setEnd]     = useState(n)
  const router       = useRouter()
  const searchParams = useSearchParams()
  const pathname     = usePathname()

  const pct = (v: number) => (n === 0 ? 0 : (v / n) * 100)

  const apply = () => {
    const ids    = games.slice(start, end + 1).map(g => g.id).join(',')
    const params = new URLSearchParams(searchParams.toString())
    params.set('games', ids)
    params.delete('filter')
    router.push(`${pathname}?${params.toString()}`)
  }

  const reset = () => {
    setStart(0)
    setEnd(n)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('games')
    params.delete('filter')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div style={{
      padding: '10px 16px 12px',
      background: '#ffffff',
      borderRadius: 8,
      border: '1px solid #e2e5eb',
      minWidth: 280,
    }}>
      <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
        Custom Date Range
      </div>

      {/* Track */}
      <div style={{ position: 'relative', height: 20, margin: '0 6px' }}>
        <div style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          left: 0, right: 0, height: 3, background: '#e2e5eb', borderRadius: 2,
        }} />
        <div style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%`,
          height: 3, background: '#307b92', borderRadius: 2, pointerEvents: 'none',
        }} />
        <input type="range" min={0} max={n} value={start}
          onChange={e => setStart(Math.min(+e.target.value, end - 1))}
          className="date-slider-input"
          style={{ position: 'absolute', width: '100%', zIndex: 2 }}
        />
        <input type="range" min={0} max={n} value={end}
          onChange={e => setEnd(Math.max(+e.target.value, start + 1))}
          className="date-slider-input"
          style={{ position: 'absolute', width: '100%', zIndex: 2 }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 11, color: '#307b92', fontWeight: 600 }}>{games[start]?.label}</span>
        <span style={{ fontSize: 10, color: '#6b7280' }}>
          {end - start + 1} game{end - start + 1 !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 11, color: '#307b92', fontWeight: 600 }}>{games[end]?.label}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
        <button onClick={reset} style={{
          padding: '4px 12px', borderRadius: 14, border: '1px solid #e2e5eb',
          background: '#eef1f6', color: '#374151', fontSize: 10, cursor: 'pointer',
        }}>Reset</button>
        <button onClick={apply} style={{
          padding: '4px 14px', borderRadius: 14, border: 'none',
          background: '#307b92', color: '#ffffff', fontSize: 10, fontWeight: 700, cursor: 'pointer',
        }}>Apply</button>
      </div>
    </div>
  )
}

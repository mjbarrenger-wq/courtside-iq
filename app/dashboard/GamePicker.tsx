'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export interface PickerGame {
  id: string
  label: string       // e.g. "24 Oct"
  opponent: string
  result: 'W' | 'L'
  score: string       // e.g. "49-27"
}

export function GamePicker({ games }: { games: PickerGame[] }) {
  const [open, setOpen]       = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const router       = useRouter()
  const searchParams = useSearchParams()
  const pathname     = usePathname()

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  const apply = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (selected.size > 0) {
      params.set('games', [...selected].join(','))
      params.delete('filter')
    } else {
      params.delete('games')
    }
    router.push(`${pathname}?${params.toString()}`)
    setOpen(false)
  }

  const n = selected.size
  const btnStyle = (mini?: boolean): React.CSSProperties => ({
    padding: mini ? '3px 10px' : '5px 14px',
    borderRadius: 14,
    border: '1px solid #2a4a6e',
    background: 'transparent',
    color: '#97cfdc',
    fontSize: 10,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  })

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '5px 12px',
          borderRadius: 20,
          border: `1px solid ${n > 0 ? '#307b92' : '#3a5a7a'}`,
          background: n > 0 ? '#1a3a54' : '#0d1b2e',
          color: n > 0 ? '#97cfdc' : '#cbd5e1',
          fontSize: 11,
          fontWeight: n > 0 ? 700 : 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          whiteSpace: 'nowrap',
        }}
      >
        🎮 {n > 0 ? `${n} Games Selected` : 'Pick Games'} {open ? '▲' : '▼'}
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          {/* Click-away overlay */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 90 }}
          />
          <div style={{
            position: 'absolute',
            top: 36,
            right: 0,
            zIndex: 100,
            background: '#0d1b2e',
            border: '1px solid #2a4a6e',
            borderRadius: 10,
            padding: '12px',
            width: 300,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}>
            {/* Controls row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <button style={btnStyle(true)} onClick={() => setSelected(new Set(games.map(g => g.id)))}>
                All
              </button>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                {n > 0 ? `${n} of ${games.length} selected` : 'No games selected'}
              </span>
              <button style={btnStyle(true)} onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>

            {/* Game list */}
            <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 8 }}>
              {games.map(g => (
                <label key={g.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 4px',
                  cursor: 'pointer',
                  borderRadius: 4,
                  borderBottom: '1px solid #1a3050',
                }}>
                  <input
                    type="checkbox"
                    checked={selected.has(g.id)}
                    onChange={() => toggle(g.id)}
                    style={{ accentColor: '#307b92', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{
                    fontSize: 10, fontWeight: 700, width: 14, flexShrink: 0,
                    color: g.result === 'W' ? '#22c55e' : '#ef4444',
                  }}>{g.result}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', width: 40, flexShrink: 0 }}>{g.label}</span>
                  <span style={{ fontSize: 11, color: '#cbd5e1', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {g.opponent}
                  </span>
                  <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>{g.score}</span>
                </label>
              ))}
            </div>

            {/* Apply */}
            <button
              onClick={apply}
              disabled={n === 0}
              style={{
                width: '100%',
                padding: '7px',
                borderRadius: 8,
                border: 'none',
                background: n > 0 ? '#307b92' : '#1a3050',
                color: n > 0 ? '#fff' : '#475569',
                fontSize: 11,
                fontWeight: 700,
                cursor: n > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              {n > 0 ? `Apply (${n} game${n !== 1 ? 's' : ''})` : 'Select games above'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

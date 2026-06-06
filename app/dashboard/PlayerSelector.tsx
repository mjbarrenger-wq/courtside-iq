'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export interface PlayerOption {
  id: string
  name: string
  jersey: number
}

export function PlayerSelector({
  players,
  currentPlayerId,
}: {
  players: PlayerOption[]
  currentPlayerId?: string
}) {
  const router      = useRouter()
  const searchParams = useSearchParams()

  const onChange = (playerId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (playerId === 'team') {
      params.delete('player')
    } else {
      params.set('player', playerId)
    }
    router.push(`/dashboard?${params.toString()}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Player:
      </span>
      <select
        value={currentPlayerId ?? 'team'}
        onChange={e => onChange(e.target.value)}
        style={{
          background: '#0d1b2e',
          border: `1px solid ${currentPlayerId ? '#307b92' : '#2a4a6e'}`,
          color: currentPlayerId ? '#97cfdc' : '#cbd5e1',
          fontSize: 12,
          fontWeight: 600,
          padding: '5px 32px 5px 12px',
          borderRadius: 20,
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0l5 6 5-6z' fill='%2397cfdc'/></svg>")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          outline: 'none',
          minWidth: 160,
        }}
      >
        <option value="team">🏀 Team View</option>
        {players.map(p => (
          <option key={p.id} value={p.id}>
            #{p.jersey} {p.name}
          </option>
        ))}
      </select>
    </div>
  )
}

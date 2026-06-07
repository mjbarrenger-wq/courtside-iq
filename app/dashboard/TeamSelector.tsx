'use client'
import { useRouter, useSearchParams } from 'next/navigation'

export type TeamOption = { id: string; name: string; age_group: string }

export function TeamSelector({ teams, currentTeamId }: { teams: TeamOption[]; currentTeamId: string }) {
  const router = useRouter()
  const params = useSearchParams()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const p = new URLSearchParams(params.toString())
    p.set('teamId', e.target.value)
    // Reset player/game filters when switching teams
    p.delete('player')
    p.delete('games')
    p.delete('filter')
    router.push(`/dashboard?${p.toString()}`)
  }

  return (
    <select
      value={currentTeamId}
      onChange={onChange}
      style={{
        background: '#0d1b2e',
        border: '1px solid #2a4a6e',
        color: '#e2e8f0',
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {teams.map(t => (
        <option key={t.id} value={t.id}>
          {t.name} {t.age_group ? `· ${t.age_group}` : ''}
        </option>
      ))}
    </select>
  )
}

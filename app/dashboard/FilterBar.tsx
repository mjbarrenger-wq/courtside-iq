'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { FilterKey, GameTypeKey } from './filterConfig'
import { FILTER_CONFIG, GAME_TYPE_CONFIG } from './filterConfig'

interface FilterBarProps {
  current:     FilterKey
  currentType: GameTypeKey
}

export function FilterBar({ current, currentType }: FilterBarProps) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const pathname     = usePathname()

  const navigate = (filterKey: string, typeKey: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('filter', filterKey)
    params.set('type', typeKey)
    params.delete('games')
    router.push(`${pathname}?${params.toString()}`)
  }

  const pillStyle = (active: boolean) => ({
    padding: '5px 11px',
    borderRadius: 20,
    border: `1px solid ${active ? '#307b92' : '#e2e5eb'}`,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: active ? 700 : 500,
    background: active ? '#307b92' : '#eef1f6',
    color: active ? '#ffffff' : '#374151',
    whiteSpace: 'nowrap' as const,
  })

  const labelStyle = {
    fontSize: 10,
    color: '#6b7280',
    marginRight: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    minWidth: 32,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Row 1 — performance / recency filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={labelStyle}>View:</span>
        {FILTER_CONFIG.map(f => (
          <button key={f.key} onClick={() => navigate(f.key, currentType)} style={pillStyle(f.key === current)}>
            {f.emoji} {f.label}
          </button>
        ))}
      </div>

      {/* Row 2 — game type filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={labelStyle}>Type:</span>
        {GAME_TYPE_CONFIG.map(t => (
          <button key={t.key} onClick={() => navigate(current, t.key)} style={pillStyle(t.key === currentType)}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

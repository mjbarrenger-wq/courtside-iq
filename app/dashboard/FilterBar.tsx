'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { FilterKey, ConcreteGameType } from './filterConfig'
import {
  FILTER_CONFIG, GAME_TYPE_CONFIG, CONCRETE_GAME_TYPES,
  isAllGameTypes, serialiseGameTypes, toggleGameType,
} from './filterConfig'

interface FilterBarProps {
  current:      FilterKey
  currentTypes: ConcreteGameType[]
}

export function FilterBar({ current, currentTypes }: FilterBarProps) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const pathname     = usePathname()

  const navigate = (filterKey: string, types: ConcreteGameType[]) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('filter', filterKey)
    params.set('type', serialiseGameTypes(types))
    params.delete('games')
    router.push(`${pathname}?${params.toString()}`)
  }

  const allTypes = isAllGameTypes(currentTypes)

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
      {/* Row 1 — performance / recency filters (single choice) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={labelStyle}>View:</span>
        {FILTER_CONFIG.map(f => (
          <button key={f.key} onClick={() => navigate(f.key, currentTypes)} style={pillStyle(f.key === current)}>
            {f.emoji} {f.label}
          </button>
        ))}
      </div>

      {/* Row 2 — game types (multi choice: combine any, or switch one off to exclude it) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={labelStyle}>Type:</span>
        {GAME_TYPE_CONFIG.map(t => {
          if (t.key === 'all_types') {
            return (
              <button
                key={t.key}
                onClick={() => navigate(current, [...CONCRETE_GAME_TYPES])}
                style={pillStyle(allTypes)}
                title="Show every game type"
              >
                {t.emoji} {t.label}
              </button>
            )
          }
          const key = t.key as ConcreteGameType
          // From "everything", a chip reads as off and one click narrows to just
          // that type — the behaviour this bar has always had. Once a real subset
          // is showing, the chips reflect it and each click adds or removes one.
          const active = !allTypes && currentTypes.includes(key)
          return (
            <button
              key={t.key}
              onClick={() => navigate(current, allTypes ? [key] : toggleGameType(currentTypes, key))}
              style={pillStyle(active)}
              title={
                allTypes ? `Show only ${t.label}`
                : active ? `Remove ${t.label} from the selection`
                : `Add ${t.label} to the selection`
              }
            >
              {t.emoji} {t.label}
            </button>
          )
        })}
        <span style={{ fontSize: 10, color: '#9aa3af', marginLeft: 2 }}>
          {allTypes ? 'pick one, then add more' : 'click to add or remove'}
        </span>
      </div>
    </div>
  )
}

'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { FilterKey } from './filterConfig'
import { FILTER_CONFIG } from './filterConfig'

export function FilterBar({ current }: { current: FilterKey }) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const pathname     = usePathname()

  const navigate = (filterKey: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('filter', filterKey)
    params.delete('games')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, color: '#cbd5e1', marginRight: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        View:
      </span>
      {FILTER_CONFIG.map(f => {
        const active = f.key === current
        return (
          <button
            key={f.key}
            onClick={() => navigate(f.key)}
            style={{
              padding: '5px 11px',
              borderRadius: 20,
              border: `1px solid ${active ? '#307b92' : '#3a5a7a'}`,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              background: active ? '#307b92' : '#1a3a54',
              color: active ? '#ffffff' : '#97cfdc',
              whiteSpace: 'nowrap',
            }}
          >
            {f.emoji} {f.label}
          </button>
        )
      })}
    </div>
  )
}

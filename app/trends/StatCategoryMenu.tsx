'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { STAT_CATEGORIES, type StatKey } from './statCategories'

export function StatCategoryMenu({
  current,
}: {
  current: StatKey
}) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const pathname     = usePathname()

  const onChange = (key: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('stat', key)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Stat:
      </span>
      <select
        value={current}
        onChange={e => onChange(e.target.value)}
        style={{
          background: current === 'ppp' ? '#ffffff' : '#e8f4f8',
          border: `1px solid ${current === 'ppp' ? '#e2e5eb' : '#307b92'}`,
          color: current === 'ppp' ? '#374151' : '#307b92',
          fontSize: 12,
          fontWeight: 600,
          padding: '5px 32px 5px 12px',
          borderRadius: 20,
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0l5 6 5-6z' fill='%23374151'/></svg>")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          outline: 'none',
          minWidth: 190,
        }}
      >
        {STAT_CATEGORIES.map(c => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </select>
    </div>
  )
}

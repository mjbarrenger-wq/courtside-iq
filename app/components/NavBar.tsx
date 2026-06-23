'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Overview',   href: '/' },
  { label: 'Dashboard',  href: '/dashboard' },
  { label: 'Trends',     href: '/trends' },
  { label: 'Quadrants',  href: '/players' },
  { label: 'Profiles',   href: '/profiles' },
  { label: 'Rotations',  href: '/rotations' },
  { label: 'Practice',   href: '/practice' },
  { label: 'Drills',     href: '/drills' },
  { label: 'Glossary',   href: '/glossary' },
]

export function NavBar() {
  const pathname = usePathname()

  return (
    <nav style={{
      background: '#ffffff',
      borderBottom: '1px solid #e2e5eb',
      padding: '0 28px',
      height: 44,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      flexShrink: 0,
    }}>
      {/* Brand */}
      <Link href="/" style={{
        fontSize: 14,
        fontWeight: 800,
        color: '#307b92',
        letterSpacing: '0.06em',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}>
        COURTSIDE IQ
      </Link>

      {/* Nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {NAV_ITEMS.map(({ label, href }) => {
          const isActive = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              style={{
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#307b92' : '#374151',
                textDecoration: 'none',
                padding: '5px 10px',
                borderRadius: 6,
                background: isActive ? '#e8f4f8' : 'transparent',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

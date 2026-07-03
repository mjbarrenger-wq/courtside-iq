'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Overview',    href: '/' },
  { label: 'Driver Tree', href: '/dashboard' },
  { label: 'Quadrants',   href: '/players' },
  { label: 'Profiles',    href: '/profiles' },
  { label: 'Trends',      href: '/trends' },
  { label: 'Practice',    href: '/practice' },
  { label: 'Drills',      href: '/drills' },
  { label: 'Rotations',   href: '/rotations' },
  { label: 'Game Config', href: '/games' },
  { label: 'Debriefs',    href: '/debriefs' },
  { label: 'Glossary',    href: '/glossary' },
]

export function NavBar() {
  const pathname = usePathname()

  return (
    // Layout lifted to mobile-first Tailwind classes; cosmetic styles stay inline.
    // Desktop (md+) reproduces the original exactly: h-11 = 44px, md:px-7 = 28px,
    // overflow visible. Below md the link row becomes a horizontal scroll strip
    // (brand pinned left) so every link stays reachable on a phone.
    <nav
      className="sticky top-0 z-[1000] shrink-0 flex items-center justify-between gap-3 h-11 px-4 md:px-7"
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e5eb',
      }}
    >
      {/* Brand */}
      <Link href="/" className="shrink-0" style={{
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
      <div className="nav-scroll flex items-center gap-0.5 overflow-x-auto md:overflow-visible">
        {NAV_ITEMS.map(({ label, href }) => {
          // Individual debriefs live at /games/[id] — nested under the Game
          // Config route but conceptually part of Debriefs, so they shouldn't
          // both highlight the same way a plain startsWith(href) would give.
          const isActive = href === '/'
            ? pathname === '/'
            : href === '/games'
              ? pathname === '/games'
              : href === '/debriefs'
                ? pathname === '/debriefs' || pathname.startsWith('/games/')
                : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="shrink-0"
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

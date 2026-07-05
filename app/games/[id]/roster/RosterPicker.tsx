'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadEntryState, saveEntryState, newEntryState } from '@/lib/entryState'

const BORDER = '#e2e5eb'
const CARD   = '#ffffff'
const TEAL   = '#307b92'
const SEC    = '#374151'
const MUTED  = '#6b7280'
const GREEN  = '#059669'
const AMBER  = '#d97706'

export interface RosterPlayer {
  id: string
  jersey_number: number
  first_name: string
  last_name: string
}

export default function RosterPicker({ gameId, players }: { gameId: string; players: RosterPlayer[] }) {
  const router = useRouter()

  const [dressed, setDressed] = useState<Set<string>>(() => new Set(players.map(p => p.id)))
  const [starters, setStarters] = useState<string[]>([])
  const [resumed, setResumed] = useState(false)

  // Resume a game already in progress (or one whose roster was set earlier) so we
  // never clobber logged events by re-visiting this screen.
  useEffect(() => {
    const existing = loadEntryState(gameId)
    if (existing) {
      setDressed(new Set(existing.dressed))
      setStarters(existing.starters.slice(0, 5))
      setResumed(existing.events.length > 0)
    }
  }, [gameId])

  function toggleDressed(id: string) {
    setDressed(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setStarters(s => s.filter(x => x !== id)) // an undressed player can't start
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleStarter(id: string) {
    if (!dressed.has(id)) return
    setStarters(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 5) return prev // cap at five; deselect one first
      return [...prev, id]
    })
  }

  const dressedCount = dressed.size
  const canStart = starters.length === 5 && dressedCount >= 5

  function proceed() {
    if (!canStart) return
    const existing = loadEntryState(gameId)
    const state = existing
      ? { ...existing, dressed: [...dressed], starters, updatedAt: Date.now() }
      : newEntryState(gameId, [...dressed], starters)
    saveEntryState(state)
    router.push(`/games/${gameId}/enter`)
  }

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{
        padding: '12px 18px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TEAL }}>DRESSED ROSTER &amp; STARTERS</div>
        <div style={{ fontSize: 11, color: MUTED }}>
          {dressedCount} dressed · <span style={{ color: starters.length === 5 ? GREEN : AMBER, fontWeight: 700 }}>{starters.length}/5 starters</span>
        </div>
      </div>

      {resumed && (
        <div style={{ padding: '9px 18px', background: '#fffbeb', borderBottom: `1px solid ${BORDER}`, fontSize: 11, color: AMBER, fontWeight: 600 }}>
          This game already has logged events — changing the roster won&rsquo;t erase them. Continue to keep scoring.
        </div>
      )}

      <div>
        {players.map((p, i) => {
          const isDressed = dressed.has(p.id)
          const isStarter = starters.includes(p.id)
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px',
              borderBottom: i < players.length - 1 ? `1px solid ${BORDER}` : 'none',
              background: isDressed ? 'transparent' : '#f8f9fb',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer' }}>
                <input type="checkbox" checked={isDressed} onChange={() => toggleDressed(p.id)}
                  style={{ width: 17, height: 17, accentColor: TEAL, cursor: 'pointer' }} />
                <span style={{
                  fontSize: 12, fontWeight: 800, color: isDressed ? TEAL : MUTED,
                  minWidth: 30, textAlign: 'right',
                }}>#{p.jersey_number}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: isDressed ? SEC : MUTED }}>
                  {p.first_name} {p.last_name}
                </span>
              </label>

              <button
                type="button" onClick={() => toggleStarter(p.id)} disabled={!isDressed}
                style={{
                  fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: isDressed ? 'pointer' : 'not-allowed',
                  border: `1px solid ${isStarter ? TEAL : BORDER}`,
                  color: isStarter ? '#fff' : (isDressed ? TEAL : '#c7cdd6'),
                  background: isStarter ? TEAL : (isDressed ? '#eaf3f6' : '#f1f3f7'),
                  minWidth: 92,
                }}
              >{isStarter ? '★ Starter' : 'Bench'}</button>
            </div>
          )
        })}
      </div>

      <div style={{
        padding: '14px 18px', borderTop: `1px solid ${BORDER}`, background: '#f8f9fb',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <button
          type="button" onClick={proceed} disabled={!canStart}
          style={{
            fontSize: 13, fontWeight: 700, color: canStart ? '#fff' : MUTED,
            background: canStart ? TEAL : '#eef1f6', border: 'none', borderRadius: 8, padding: '10px 20px',
            cursor: canStart ? 'pointer' : 'default',
          }}
        >Start scoring →</button>
        {!canStart && (
          <span style={{ fontSize: 11, color: MUTED }}>
            Pick exactly five starters from the dressed players to continue.
          </span>
        )}
      </div>
    </div>
  )
}

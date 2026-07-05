'use client'

import { useMemo, useState } from 'react'
import { updateGame, deleteGame, type GameEditableFields } from './actions'
import { GAME_TYPE_CONFIG, type GameTypeKey } from '../dashboard/filterConfig'

const BG     = '#f4f5f7'
const BORDER = '#e2e5eb'
const CARD   = '#ffffff'
const TEAL   = '#307b92'
const SEC    = '#374151'
const MUTED  = '#6b7280'
const GREEN  = '#059669'
const RED    = '#dc2626'
const AMBER  = '#d97706'

export interface GameRow {
  id: string
  game_date: string
  opponent_id: string
  home_away: 'home' | 'away' | 'neutral' | null
  round: string | null
  venue: string | null
  game_type: GameTypeKey
  team_score: number | null
  opponent_score: number | null
  result: string | null
  video_urls: string[] | null
}

export interface OpponentOption {
  id: string
  full_name: string
}

const TYPE_OPTIONS = GAME_TYPE_CONFIG.filter(t => t.key !== 'all_types')

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  fontFamily: 'inherit',
  color: SEC,
  background: '#ffffff',
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: '6px 8px',
}

function rowsEqual(a: GameRow, b: GameRow): boolean {
  return (
    a.game_date === b.game_date &&
    a.opponent_id === b.opponent_id &&
    (a.home_away ?? '') === (b.home_away ?? '') &&
    (a.round ?? '') === (b.round ?? '') &&
    (a.venue ?? '') === (b.venue ?? '') &&
    a.game_type === b.game_type
  )
}

export default function GamesSetupTable({
  initialRows,
  opponents,
}: {
  initialRows: GameRow[]
  opponents: OpponentOption[]
}) {
  const [rows, setRows] = useState<GameRow[]>(initialRows)
  const [original, setOriginal] = useState<Record<string, GameRow>>(
    Object.fromEntries(initialRows.map(r => [r.id, r])),
  )
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<GameTypeKey>('all_types')

  const opponentName = useMemo(() => {
    const m = new Map(opponents.map(o => [o.id, o.full_name]))
    return (id: string) => m.get(id) ?? 'Unknown'
  }, [opponents])

  // Rows with no round set that fall after the latest game that DOES have a
  // round — a generic (not hardcoded) heuristic flag for "this looks like it
  // might be post-regular-season and still needs a type assigned".
  const lastRoundedDate = useMemo(() => {
    const dated = rows.filter(r => (r.round ?? '').trim() !== '').map(r => r.game_date)
    return dated.length ? dated.sort().slice(-1)[0] : null
  }, [rows])

  function updateRow(id: string, patch: Partial<GameRow>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  function undoRow(id: string) {
    const orig = original[id]
    if (!orig) return
    setRows(prev => prev.map(r => (r.id === id ? orig : r)))
    setErrors(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function saveRow(id: string) {
    const row = rows.find(r => r.id === id)
    if (!row) return
    setSaving(prev => new Set(prev).add(id))
    setErrors(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })

    const fields: GameEditableFields = {
      game_date:   row.game_date,
      opponent_id: row.opponent_id,
      home_away:   row.home_away ?? undefined,
      round:       row.round?.trim() ? row.round.trim() : null,
      venue:       row.venue?.trim() ? row.venue.trim() : null,
      game_type:   row.game_type,
    }

    const result = await updateGame(id, fields)

    setSaving(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })

    if (!result.success) {
      setErrors(prev => ({ ...prev, [id]: result.error ?? 'Save failed' }))
      return
    }

    setOriginal(prev => ({ ...prev, [id]: row }))
    setSaved(prev => new Set(prev).add(id))
    setTimeout(() => {
      setSaved(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 1800)
  }

  async function deleteRow(id: string) {
    const row = rows.find(r => r.id === id)
    if (!row) return
    const label = `${opponentName(row.opponent_id)} · ${row.game_date}`
    const ok = window.confirm(
      `Delete game vs ${label}?\n\nThis permanently removes the game and its box score, ` +
      `lineup stints, play-by-play and stored debrief. This cannot be undone.`,
    )
    if (!ok) return

    setDeleting(prev => new Set(prev).add(id))
    setErrors(prev => { const next = { ...prev }; delete next[id]; return next })

    const result = await deleteGame(id)

    setDeleting(prev => { const next = new Set(prev); next.delete(id); return next })

    if (!result.success) {
      setErrors(prev => ({ ...prev, [id]: result.error ?? 'Delete failed' }))
      return
    }
    setRows(prev => prev.filter(r => r.id !== id))
    setOriginal(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  const dirtyIds = useMemo(
    () => rows.filter(r => !rowsEqual(r, original[r.id])).map(r => r.id),
    [rows, original],
  )

  async function saveAll() {
    for (const id of dirtyIds) {
      // eslint-disable-next-line no-await-in-loop
      await saveRow(id)
    }
  }

  const filteredRows = rows.filter(r => {
    if (typeFilter !== 'all_types' && r.game_type !== typeFilter) return false
    if (search.trim()) {
      const name = opponentName(r.opponent_id).toLowerCase()
      if (!name.includes(search.trim().toLowerCase())) return false
    }
    return true
  })

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '13px 20px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEAL }}>ALL GAMES</span>
          <span style={{ fontSize: 11, color: MUTED }}>{filteredRows.length} of {rows.length}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="Search opponent…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, width: 160 }}
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as GameTypeKey)}
            style={{ ...inputStyle, width: 150 }}
          >
            {GAME_TYPE_CONFIG.map(t => (
              <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>
            ))}
          </select>
          <button
            onClick={saveAll}
            disabled={dirtyIds.length === 0}
            style={{
              fontSize: 12, fontWeight: 700,
              color: dirtyIds.length ? '#ffffff' : MUTED,
              background: dirtyIds.length ? TEAL : '#eef1f6',
              border: 'none', borderRadius: 7, padding: '7px 14px',
              cursor: dirtyIds.length ? 'pointer' : 'default',
            }}
          >
            Save all changes{dirtyIds.length ? ` (${dirtyIds.length})` : ''}
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead>
            <tr style={{ background: '#f0f2f7' }}>
              {['Date', 'Opponent', 'Home/Away', 'Round', 'Venue', 'Type', 'Score', 'Result', ''].map((label, i) => (
                <th key={i} style={{
                  padding: '9px 12px', textAlign: 'left',
                  fontSize: 10, fontWeight: 700, color: MUTED,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap',
                }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r, i) => {
              const isDirty  = !rowsEqual(r, original[r.id])
              const isSaving = saving.has(r.id)
              const isSaved  = saved.has(r.id)
              const error    = errors[r.id]
              const flagNoRound = !r.round?.trim() && lastRoundedDate != null && r.game_date > lastRoundedDate

              return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'transparent' : '#f8f9fb' }}>
                  <td style={{ padding: '7px 12px', borderBottom: `1px solid ${BORDER}` }}>
                    <input
                      type="date"
                      value={r.game_date}
                      onChange={e => updateRow(r.id, { game_date: e.target.value })}
                      style={{ ...inputStyle, width: 128 }}
                    />
                  </td>
                  <td style={{ padding: '7px 12px', borderBottom: `1px solid ${BORDER}` }}>
                    <select
                      value={r.opponent_id}
                      onChange={e => updateRow(r.id, { opponent_id: e.target.value })}
                      style={{ ...inputStyle, width: 170 }}
                    >
                      {opponents.map(o => (
                        <option key={o.id} value={o.id}>{o.full_name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '7px 12px', borderBottom: `1px solid ${BORDER}` }}>
                    <select
                      value={r.home_away ?? ''}
                      onChange={e => updateRow(r.id, { home_away: (e.target.value || null) as GameRow['home_away'] })}
                      style={{ ...inputStyle, width: 92 }}
                    >
                      <option value="">—</option>
                      <option value="home">Home</option>
                      <option value="away">Away</option>
                      <option value="neutral">Neutral</option>
                    </select>
                  </td>
                  <td style={{ padding: '7px 12px', borderBottom: `1px solid ${BORDER}` }}>
                    <input
                      value={r.round ?? ''}
                      placeholder="—"
                      onChange={e => updateRow(r.id, { round: e.target.value })}
                      style={{ ...inputStyle, width: 60 }}
                    />
                  </td>
                  <td style={{ padding: '7px 12px', borderBottom: `1px solid ${BORDER}` }}>
                    <input
                      value={r.venue ?? ''}
                      placeholder="—"
                      onChange={e => updateRow(r.id, { venue: e.target.value })}
                      style={{ ...inputStyle, width: 110 }}
                    />
                  </td>
                  <td style={{ padding: '7px 12px', borderBottom: `1px solid ${BORDER}` }}>
                    <select
                      value={r.game_type}
                      onChange={e => updateRow(r.id, { game_type: e.target.value as GameTypeKey })}
                      style={{ ...inputStyle, width: 138 }}
                    >
                      {TYPE_OPTIONS.map(t => (
                        <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>
                      ))}
                    </select>
                    {flagNoRound && (
                      <div style={{ fontSize: 9, color: AMBER, fontWeight: 700, marginTop: 4 }}>
                        ⚠ no round · past last-rounded game — confirm type
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '7px 12px', borderBottom: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 700, color: SEC, whiteSpace: 'nowrap' }}>
                    {r.team_score ?? '—'}–{r.opponent_score ?? '—'}
                  </td>
                  <td style={{ padding: '7px 12px', borderBottom: `1px solid ${BORDER}` }}>
                    {r.result && (
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
                        color: r.result === 'W' ? GREEN : RED,
                        background: r.result === 'W' ? '#ecfdf5' : '#fef2f2',
                        border: `1px solid ${r.result === 'W' ? '#86efac' : '#fca5a5'}`,
                      }}>{r.result}</span>
                    )}
                  </td>
                  <td style={{ padding: '7px 12px', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <a href={`/games/${r.id}`} style={{ fontSize: 10, color: TEAL, textDecoration: 'none', fontWeight: 600 }}>
                        Debrief →
                      </a>
                      {r.video_urls && r.video_urls.length > 0 && (
                        <a href={`/games/${r.id}/enter`} title="Open the video scoring screen"
                          style={{ fontSize: 10, color: TEAL, textDecoration: 'none', fontWeight: 600 }}>
                          {r.team_score == null ? 'Score →' : 'Edit →'}
                        </a>
                      )}
                      {isDirty && !isSaving && (
                        <>
                          <button
                            onClick={() => saveRow(r.id)}
                            style={{
                              fontSize: 10, fontWeight: 700, color: '#fff', background: TEAL,
                              border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer',
                            }}
                          >Save</button>
                          <button
                            onClick={() => undoRow(r.id)}
                            style={{
                              fontSize: 10, fontWeight: 600, color: MUTED, background: 'transparent',
                              border: 'none', cursor: 'pointer', textDecoration: 'underline',
                            }}
                          >Undo</button>
                        </>
                      )}
                      {isSaving && <span style={{ fontSize: 10, color: MUTED }}>Saving…</span>}
                      {isSaved && !isDirty && <span style={{ fontSize: 10, color: GREEN, fontWeight: 700 }}>✓ Saved</span>}
                      {error && <span style={{ fontSize: 10, color: RED, fontWeight: 600 }} title={error}>Error</span>}
                      {deleting.has(r.id) ? (
                        <span style={{ fontSize: 10, color: MUTED }}>Deleting…</span>
                      ) : (
                        <button
                          onClick={() => deleteRow(r.id)}
                          title="Delete this game permanently"
                          style={{
                            fontSize: 10, fontWeight: 700, color: RED, background: 'transparent',
                            border: 'none', cursor: 'pointer', marginLeft: 2,
                          }}
                        >Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: MUTED }}>
                  No games match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '10px 20px', borderTop: `1px solid ${BORDER}`, fontSize: 10, color: MUTED, background: BG }}>
        Score and result come from the box-score import and aren't editable here. Changes save per row — use{' '}
        <strong>Save all changes</strong> to push everything you've edited at once.
      </div>
    </div>
  )
}
